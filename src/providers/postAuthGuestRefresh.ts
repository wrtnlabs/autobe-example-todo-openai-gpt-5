import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ITodoMvpGuestRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpGuestRefresh";
import { ITodoMvpGuest } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpGuest";
import { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";

export async function postAuthGuestRefresh(props: {
  body: ITodoMvpGuestRefresh.IRequest;
}): Promise<ITodoMvpGuest.IAuthorized> {
  const { body } = props;

  // Step 1: Verify and decode the refresh token (must be valid and for guest)
  let decoded: unknown;
  try {
    decoded = (
      jwt as unknown as {
        verify: (
          token: string,
          secret: string,
          options?: Record<string, unknown>,
        ) => unknown;
      }
    ).verify(body.refresh_token, MyGlobal.env.JWT_SECRET_KEY, {
      issuer: "autobe",
    });
  } catch {
    throw new HttpException("Unauthorized: Invalid refresh token", 401);
  }

  // Narrow decoded payload to expected Guest shape
  if (
    typeof decoded !== "object" ||
    decoded === null ||
    !("id" in decoded) ||
    !("type" in decoded) ||
    typeof (decoded as Record<string, unknown>).id !== "string" ||
    (decoded as Record<string, unknown>).type !== "guest"
  ) {
    throw new HttpException("Unauthorized: Invalid refresh token payload", 401);
  }
  const guestId = (decoded as { id: string; type: "guest" }).id as string &
    tags.Format<"uuid">;

  // Step 2: Hash the presented refresh token and locate the active session
  const nowIso: string & tags.Format<"date-time"> = toISOStringSafe(new Date());
  const tokenHash = await PasswordUtil.hash(body.refresh_token);

  const session = await MyGlobal.prisma.todo_mvp_sessions.findFirst({
    where: {
      session_token_hash: tokenHash,
      revoked_at: null,
      expires_at: { gt: nowIso },
    },
  });
  if (!session) {
    throw new HttpException(
      "Unauthorized: Refresh session not found or expired",
      401,
    );
  }

  // Step 3: Load guest identity (must exist)
  const guest = await MyGlobal.prisma.todo_mvp_guests.findUnique({
    where: { id: guestId },
  });
  if (!guest) {
    throw new HttpException("Unauthorized: Guest not found", 401);
  }

  // Step 4: Issue new tokens (rotate)
  const nowMs = Date.now();
  const accessExpIso: string & tags.Format<"date-time"> = toISOStringSafe(
    new Date(nowMs + 60 * 60 * 1000),
  ); // 1 hour
  const refreshExpIso: string & tags.Format<"date-time"> = toISOStringSafe(
    new Date(nowMs + 7 * 24 * 60 * 60 * 1000),
  ); // 7 days

  const accessToken = (
    jwt as unknown as {
      sign: (
        payload: object,
        secret: string,
        options?: Record<string, unknown>,
      ) => string;
    }
  ).sign({ id: guestId, type: "guest" }, MyGlobal.env.JWT_SECRET_KEY, {
    expiresIn: "1h",
    issuer: "autobe",
  });
  const newRefreshToken = (
    jwt as unknown as {
      sign: (
        payload: object,
        secret: string,
        options?: Record<string, unknown>,
      ) => string;
    }
  ).sign(
    { id: guestId, type: "guest", token_type: "refresh" },
    MyGlobal.env.JWT_SECRET_KEY,
    { expiresIn: "7d", issuer: "autobe" },
  );
  const newRefreshHash = await PasswordUtil.hash(newRefreshToken);

  // Step 5: Rotate session token and extend expiration
  await MyGlobal.prisma.todo_mvp_sessions.update({
    where: { id: session.id },
    data: {
      session_token_hash: newRefreshHash,
      last_accessed_at: nowIso,
      updated_at: nowIso,
      expires_at: refreshExpIso,
    },
  });

  // Step 6: Build response matching ITodoMvpGuest.IAuthorized
  const guestCreatedAt: string & tags.Format<"date-time"> = toISOStringSafe(
    guest.created_at as unknown as string & tags.Format<"date-time">,
  );
  const guestUpdatedAt: string & tags.Format<"date-time"> = toISOStringSafe(
    guest.updated_at as unknown as string & tags.Format<"date-time">,
  );

  return {
    id: guestId,
    created_at: guestCreatedAt,
    updated_at: guestUpdatedAt,
    token: {
      access: accessToken,
      refresh: newRefreshToken,
      expired_at: accessExpIso,
      refreshable_until: refreshExpIso,
    },
    guest: {
      id: guestId,
      created_at: guestCreatedAt,
      updated_at: guestUpdatedAt,
    },
  };
}
