import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ITodoMvpUserRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUserRefresh";
import { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";
import { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";

export async function postAuthUserRefresh(props: {
  body: ITodoMvpUserRefresh.IRequest;
}): Promise<ITodoMvpUser.IAuthorized> {
  const { body } = props;
  const { refresh_token } = body;

  /**
   * Refresh a member’s session using Auth.todo_mvp_sessions and return renewed
   * authorization.
   *
   * Validates the presented refresh token (JWT) and current session state,
   * denies when revoked/expired, rotates session token material
   * (session_token_hash and expires_at), and issues new access/refresh tokens.
   *
   * @param props - Request properties
   * @param props.body - Contains the refresh_token string for session renewal
   * @returns ITodoMvpUser.IAuthorized containing subject identity and renewed
   *   token bundle
   * @throws {HttpException} 400 when token missing or malformed
   * @throws {HttpException} 401 when invalid/expired/revoked session or token
   *   mismatch
   * @throws {HttpException} 403 when user account is not allowed (e.g.,
   *   deactivated/deleted)
   */

  if (!refresh_token || typeof refresh_token !== "string") {
    throw new HttpException("Bad Request: refresh_token is required", 400);
  }

  let decoded: any;
  try {
    decoded = (jwt as unknown as { verify: Function }).verify(
      refresh_token,
      MyGlobal.env.JWT_SECRET_KEY,
      { issuer: "autobe" },
    );
  } catch {
    throw new HttpException("Unauthorized: Invalid refresh token", 401);
  }

  // Expect payload to carry session_id and user context with tokenType
  const sessionId: string | undefined = decoded?.session_id;
  const tokenType: string | undefined = decoded?.tokenType;
  const roleType: string | undefined = decoded?.type;
  const userIdInToken: string | undefined = decoded?.id ?? decoded?.userId;

  if (
    !sessionId ||
    tokenType !== "refresh" ||
    roleType !== "user" ||
    !userIdInToken
  ) {
    throw new HttpException("Unauthorized: Invalid refresh token payload", 401);
  }

  // Fetch session and validate lifecycle
  const session = await MyGlobal.prisma.todo_mvp_sessions.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      todo_mvp_user_id: true,
      session_token_hash: true,
      created_at: true,
      updated_at: true,
      last_accessed_at: true,
      expires_at: true,
      revoked_at: true,
    },
  });
  if (!session) {
    throw new HttpException("Unauthorized: Session not found", 401);
  }
  if (
    session.todo_mvp_user_id === null ||
    session.todo_mvp_user_id === undefined
  ) {
    throw new HttpException("Unauthorized: Session has no user", 401);
  }
  if (session.todo_mvp_user_id !== userIdInToken) {
    throw new HttpException("Unauthorized: Session-user mismatch", 401);
  }

  // Validate token matches the stored hash (pre-rotation)
  const tokenMatches: boolean = await PasswordUtil.verify(
    refresh_token,
    session.session_token_hash,
  );
  if (!tokenMatches) {
    throw new HttpException("Unauthorized: Refresh token mismatch", 401);
  }

  const nowIso: string & tags.Format<"date-time"> = toISOStringSafe(new Date());
  const sessionExpiresIso: string & tags.Format<"date-time"> = toISOStringSafe(
    session.expires_at,
  );
  const isRevoked: boolean = session.revoked_at ? true : false;
  const isExpired: boolean = sessionExpiresIso <= nowIso;
  if (isRevoked || isExpired) {
    throw new HttpException("Unauthorized: Session revoked or expired", 401);
  }

  // Load user
  const user = await MyGlobal.prisma.todo_mvp_users.findUnique({
    where: { id: session.todo_mvp_user_id },
    select: {
      id: true,
      email: true,
      status: true,
      created_at: true,
      updated_at: true,
      deleted_at: true,
    },
  });
  if (!user) {
    throw new HttpException("Unauthorized: User not found", 401);
  }
  const normalizedStatus: "active" | "deactivated" =
    user.status === "active" ? "active" : "deactivated";
  if (normalizedStatus !== "active" || user.deleted_at) {
    throw new HttpException("Forbidden: User not eligible for refresh", 403);
  }

  // Lifetimes
  const accessTtlMs: number = 60 * 60 * 1000; // 1 hour
  const refreshTtlMs: number = 7 * 24 * 60 * 60 * 1000; // 7 days
  const accessExpIso: string & tags.Format<"date-time"> = toISOStringSafe(
    new Date(Date.now() + accessTtlMs),
  );

  // New refreshable_until = now + 7d (monotonic extension)
  const refreshableUntilIso: string & tags.Format<"date-time"> =
    toISOStringSafe(new Date(Date.now() + refreshTtlMs));

  // Generate new tokens
  const accessPayload = {
    id: user.id,
    type: "user",
    email: user.email,
    status: normalizedStatus,
    created_at: toISOStringSafe(user.created_at),
    updated_at: toISOStringSafe(user.updated_at),
  };
  const newAccessToken: string = (jwt as unknown as { sign: Function }).sign(
    accessPayload,
    MyGlobal.env.JWT_SECRET_KEY,
    { expiresIn: "1h", issuer: "autobe" },
  );

  const refreshPayload = {
    session_id: session.id,
    id: user.id,
    type: "user",
    tokenType: "refresh",
  };
  const newRefreshToken: string = (jwt as unknown as { sign: Function }).sign(
    refreshPayload,
    MyGlobal.env.JWT_SECRET_KEY,
    { expiresIn: "7d", issuer: "autobe" },
  );

  // Rotate session token hash and lifecycle timestamps
  const newHash: string = await PasswordUtil.hash(newRefreshToken);
  await MyGlobal.prisma.todo_mvp_sessions.update({
    where: { id: session.id },
    data: {
      session_token_hash: newHash,
      last_accessed_at: nowIso,
      updated_at: nowIso,
      expires_at: refreshableUntilIso,
    },
  });

  // Build response
  const userDeletedAt: (string & tags.Format<"date-time">) | null =
    user.deleted_at ? toISOStringSafe(user.deleted_at) : null;

  const result: ITodoMvpUser.IAuthorized = {
    id: user.id as string & tags.Format<"uuid">,
    email: user.email as string & tags.Format<"email">,
    status: normalizedStatus,
    created_at: toISOStringSafe(user.created_at),
    updated_at: toISOStringSafe(user.updated_at),
    deleted_at: userDeletedAt,
    token: {
      access: newAccessToken,
      refresh: newRefreshToken,
      expired_at: accessExpIso,
      refreshable_until: refreshableUntilIso,
    },
    user: {
      id: user.id as string & tags.Format<"uuid">,
      email: user.email as string & tags.Format<"email">,
      status: normalizedStatus,
      created_at: toISOStringSafe(user.created_at),
      updated_at: toISOStringSafe(user.updated_at),
    },
  };
  return result;
}
