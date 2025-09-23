import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppSession } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSession";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

export async function postauthTodoUserSessionsRevokeOthers(props: {
  todoUser: TodouserPayload;
  body: ITodoAppSession.IRevokeOthers;
}): Promise<void> {
  /**
   * Revoke other active sessions for the authenticated todoUser.
   *
   * - Finds other active sessions (same user, not revoked, not deleted)
   * - Applies optional filters (issued_before, expires_before, ip, user_agent)
   * - Excludes the current session by default (kept as the earliest active
   *   session proxy)
   * - Sets revoked_at and revoked_reason on sessions
   * - Revokes related refresh tokens
   * - Inserts one revocation record per session
   *
   * Authorization: requires authenticated todouser.
   *
   * @param props - Request properties
   * @param props.todoUser - Authenticated todoUser payload
   * @param props.body - Optional filters and include_current flag
   * @returns Void on success
   * @throws {HttpException} 403 when payload is not todouser
   */
  const { todoUser, body } = props;

  if (todoUser.type !== "todouser") {
    throw new HttpException(
      "Unauthorized: Only todouser can revoke sessions",
      403,
    );
  }

  const includeCurrent = body.include_current ?? false;
  const reason = body.reason ?? "user_revoke_others";

  // Determine which session to keep (proxy for current): earliest active by issued_at
  const keep = includeCurrent
    ? null
    : await MyGlobal.prisma.todo_app_sessions.findFirst({
        where: {
          todo_app_user_id: todoUser.id,
          revoked_at: null,
          deleted_at: null,
        },
        select: { id: true },
        orderBy: { issued_at: "asc" },
      });

  // Build filter for sessions to revoke
  const sessionsToConsider = await MyGlobal.prisma.todo_app_sessions.findMany({
    where: {
      todo_app_user_id: todoUser.id,
      revoked_at: null,
      deleted_at: null,
      ...(body.ip !== undefined && { ip: body.ip }),
      ...(body.user_agent !== undefined && {
        user_agent: { contains: body.user_agent },
      }),
      ...(body.issued_before !== undefined || body.expires_before !== undefined
        ? {
            ...(body.issued_before !== undefined && {
              issued_at: { lt: toISOStringSafe(body.issued_before) },
            }),
            ...(body.expires_before !== undefined && {
              expires_at: { lt: toISOStringSafe(body.expires_before) },
            }),
          }
        : {}),
    },
    select: { id: true },
    orderBy: { issued_at: "asc" },
  });

  const targets =
    !includeCurrent && keep !== null
      ? sessionsToConsider.filter((s) => s.id !== keep.id)
      : sessionsToConsider;

  if (targets.length === 0) return;

  const now = toISOStringSafe(new Date());

  await MyGlobal.prisma.$transaction(async (tx) => {
    for (const s of targets) {
      // Revoke session
      await tx.todo_app_sessions.update({
        where: { id: s.id },
        data: {
          revoked_at: now,
          revoked_reason: reason,
          updated_at: now,
        },
      });

      // Revoke related refresh tokens
      await tx.todo_app_refresh_tokens.updateMany({
        where: {
          todo_app_session_id: s.id,
          revoked_at: null,
          deleted_at: null,
        },
        data: {
          revoked_at: now,
          revoked_reason: reason,
          updated_at: now,
        },
      });

      // Create revocation entry (one per session)
      await tx.todo_app_session_revocations.create({
        data: {
          id: v4(),
          todo_app_session_id: s.id,
          revoked_at: now,
          revoked_by: "user",
          reason: reason,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      });
    }
  });
}
