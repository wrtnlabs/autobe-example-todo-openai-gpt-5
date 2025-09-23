import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppTodoUserRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserRefresh";
import { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Refresh tokens for todoUser using todo_app_refresh_tokens rotation and
 * session validity.
 *
 * Validates the provided refresh token against the database, enforces
 * single-use rotation, ensures the parent session is active (not
 * expired/revoked), and that the user holds an active todoUser role. On
 * success, issues a new access JWT and rotates the refresh token by creating a
 * child token linked via parent_id and marking the previous token as rotated.
 *
 * @param props - Request properties
 * @param props.body - Refresh request containing the refresh_token
 * @returns Authorized context with renewed access/refresh tokens and
 *   expirations
 * @throws {HttpException} 401 when token is invalid/expired/rotated/revoked or
 *   session invalid
 * @throws {HttpException} 403 when user lacks an active todoUser role
 */
export async function postauthTodoUserRefresh(props: {
  body: ITodoAppTodoUserRefresh.IRequest;
}): Promise<ITodoAppTodoUser.IAuthorized> {
  const { body } = props;

  // 1) Lookup refresh token via unique plaintext token column
  const existing = await MyGlobal.prisma.todo_app_refresh_tokens.findUnique({
    where: { token: body.refresh_token },
    include: { session: true },
  });

  if (!existing || !existing.session) {
    throw new HttpException("Unauthorized: Invalid refresh token", 401);
  }

  // 2) Temporal validations using ISO strings (avoid Date-typed variables)
  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());
  const tokenExpiresAt = toISOStringSafe(existing.expires_at);
  if (existing.revoked_at !== null || existing.rotated_at !== null) {
    throw new HttpException(
      "Unauthorized: Refresh token is no longer valid",
      401,
    );
  }
  if (tokenExpiresAt <= now) {
    throw new HttpException("Unauthorized: Refresh token expired", 401);
  }

  const session = existing.session;
  if (session.revoked_at !== null) {
    throw new HttpException("Unauthorized: Session revoked", 401);
  }
  const sessionExpiresAt = toISOStringSafe(session.expires_at);
  if (sessionExpiresAt <= now) {
    throw new HttpException("Unauthorized: Session expired", 401);
  }

  // 3) Fetch user and validate active todoUser role (unrevoked membership)
  const user = await MyGlobal.prisma.todo_app_users.findUnique({
    where: { id: session.todo_app_user_id },
  });
  if (!user) {
    throw new HttpException("Unauthorized: User not found", 401);
  }

  const activeTodoUser = await MyGlobal.prisma.todo_app_todousers.findFirst({
    where: {
      todo_app_user_id: user.id,
      revoked_at: null,
      deleted_at: null,
    },
  });
  if (!activeTodoUser) {
    throw new HttpException("Forbidden: User role not active", 403);
  }

  // 4) Prepare new tokens and expirations
  const accessExpiredAt: string & tags.Format<"date-time"> = toISOStringSafe(
    new Date(Date.now() + 60 * 60 * 1000),
  ); // +1 hour
  const refreshExpiredAt: string & tags.Format<"date-time"> = toISOStringSafe(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  ); // +7 days

  const newRefreshToken: string = `${v4()}${v4()}`;

  // 5) Rotate refresh token atomically: mark parent rotated, insert child
  await MyGlobal.prisma.$transaction([
    MyGlobal.prisma.todo_app_refresh_tokens.update({
      where: { id: existing.id },
      data: {
        rotated_at: now,
        updated_at: now,
      },
    }),
    MyGlobal.prisma.todo_app_refresh_tokens.create({
      data: {
        id: v4() as string & tags.Format<"uuid">,
        todo_app_session_id: session.id,
        parent_id: existing.id,
        token: newRefreshToken,
        token_hash: newRefreshToken, // prefer hash in production; schema has both unique
        issued_at: now,
        expires_at: refreshExpiredAt,
        created_at: now,
        updated_at: now,
      },
    }),
    // Optional: touch session updated_at for activity
    MyGlobal.prisma.todo_app_sessions.update({
      where: { id: session.id },
      data: { updated_at: now },
    }),
  ]);

  // 6) Issue new access JWT with the SAME payload structure used at login/join
  const accessToken = jwt.sign(
    { id: user.id, type: "todouser" },
    MyGlobal.env.JWT_SECRET_KEY,
    { expiresIn: "1h", issuer: "autobe" },
  );

  // 7) Build response DTO
  return {
    id: user.id as string & tags.Format<"uuid">,
    token: {
      access: accessToken,
      refresh: newRefreshToken,
      expired_at: accessExpiredAt,
      refreshable_until: refreshExpiredAt,
    },
  };
}
