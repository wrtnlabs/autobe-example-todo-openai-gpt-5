import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppGuestVisitor";

/**
 * Refresh access tokens for a guestVisitor using refresh token rotation.
 *
 * Validates the provided refresh token, ensures it is not
 * expired/rotated/revoked, and that the associated session is valid. Rotates
 * the refresh token by creating a child token and marking the prior one as
 * rotated. Issues a new access JWT with the same payload structure used at join
 * (GuestvisitorPayload).
 *
 * Security notes:
 *
 * - Looks up token by the unique `token` column. Hashing may be applied by
 *   policy, but this implementation uses the opaque token directly per schema
 *   support.
 * - Enforces single-use rotation and session validity checks.
 *
 * @param props - Request properties
 * @param props.body - Refresh request containing the opaque refresh token
 * @returns Authorized credentials containing subject id and fresh tokens
 * @throws {HttpException} 400 when input is invalid
 * @throws {HttpException} 401 when token/session is invalid or expired
 * @throws {HttpException} 403 when the account is not eligible (e.g.,
 *   inactive/deleted)
 */
export async function postauthGuestVisitorRefresh(props: {
  body: ITodoAppGuestVisitor.IRefreshRequest;
}): Promise<ITodoAppGuestVisitor.IAuthorized> {
  const refreshToken = props.body.refresh_token;
  if (!refreshToken || typeof refreshToken !== "string") {
    throw new HttpException("Bad Request: refresh_token is required", 400);
  }

  // 1) Lookup refresh token (by unique token) and include session
  const existing = await MyGlobal.prisma.todo_app_refresh_tokens.findUnique({
    where: { token: refreshToken },
    include: { session: true },
  });
  if (!existing) {
    throw new HttpException(
      "Unauthorized: Invalid or expired refresh token",
      401,
    );
  }

  // 2) Validate token state: not revoked/rotated/expired
  const nowMs = Date.now();
  const tokenExpiresMs = Date.parse(toISOStringSafe(existing.expires_at));
  if (
    existing.revoked_at !== null ||
    existing.rotated_at !== null ||
    tokenExpiresMs <= nowMs
  ) {
    throw new HttpException(
      "Unauthorized: Invalid or expired refresh token",
      401,
    );
  }

  // 3) Validate session state
  const session = existing.session;
  if (!session) {
    throw new HttpException("Unauthorized: Invalid session context", 401);
  }
  const sessionExpiresMs = Date.parse(toISOStringSafe(session.expires_at));
  if (session.revoked_at !== null || sessionExpiresMs <= nowMs) {
    throw new HttpException("Unauthorized: Session revoked or expired", 401);
  }

  // 4) Validate user eligibility
  const user = await MyGlobal.prisma.todo_app_users.findUnique({
    where: { id: session.todo_app_user_id },
  });
  if (!user) {
    throw new HttpException("Unauthorized: Subject not found", 401);
  }
  if (user.deleted_at !== null) {
    throw new HttpException("Forbidden: Account unavailable", 403);
  }
  if (user.status !== "active") {
    throw new HttpException("Forbidden: Account not active", 403);
  }

  // 5) Prepare timestamps
  const now = toISOStringSafe(new Date());
  const accessExpiresAt = toISOStringSafe(new Date(nowMs + 60 * 60 * 1000)); // 1 hour
  const refreshExpiresAt = toISOStringSafe(
    new Date(nowMs + 7 * 24 * 60 * 60 * 1000),
  ); // 7 days

  // 6) Rotate refresh token: create child and mark parent rotated
  const newRefreshToken = v4();
  await MyGlobal.prisma.$transaction([
    MyGlobal.prisma.todo_app_refresh_tokens.create({
      data: {
        id: v4(),
        todo_app_session_id: session.id,
        parent_id: existing.id,
        token: newRefreshToken,
        token_hash: newRefreshToken,
        issued_at: now,
        expires_at: refreshExpiresAt,
        created_at: now,
        updated_at: now,
      },
    }),
    MyGlobal.prisma.todo_app_refresh_tokens.update({
      where: { id: existing.id },
      data: {
        rotated_at: now,
        updated_at: now,
      },
    }),
  ]);

  // 7) Issue access token (GuestvisitorPayload structure)
  const subjectId = typia.assert<string & tags.Format<"uuid">>(user.id);
  const accessToken = jwt.sign(
    { id: subjectId, type: "guestvisitor" },
    MyGlobal.env.JWT_SECRET_KEY,
    { expiresIn: "1h", issuer: "autobe" },
  );

  // 8) Build response
  return {
    id: subjectId,
    token: {
      access: accessToken,
      refresh: newRefreshToken,
      expired_at: accessExpiresAt,
      refreshable_until: refreshExpiresAt,
    },
  };
}
