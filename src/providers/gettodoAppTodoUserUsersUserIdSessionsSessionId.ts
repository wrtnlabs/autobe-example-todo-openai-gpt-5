import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppSession } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSession";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

/**
 * Get a specific session (todo_app_sessions) for the given user
 *
 * Retrieves a single authentication session owned by the specified user. The
 * session must belong to the provided userId, and soft-deleted sessions are
 * omitted. The response never exposes sensitive token secrets (session_token).
 * Expired or revoked sessions are still retrievable and reflected in the
 * response fields.
 *
 * @param props - Request properties
 * @param props.todoUser - The authenticated todo user payload (owner context)
 * @param props.userId - Owner user's UUID (path parameter)
 * @param props.sessionId - Target session's UUID (path parameter)
 * @returns ITodoAppSession without sensitive token secret
 * @throws {HttpException} 403 when authenticated user does not match the path
 *   owner
 * @throws {HttpException} 404 when session not found or not owned by the user,
 *   or soft-deleted
 */
export async function gettodoAppTodoUserUsersUserIdSessionsSessionId(props: {
  todoUser: TodouserPayload;
  userId: string & tags.Format<"uuid">;
  sessionId: string & tags.Format<"uuid">;
}): Promise<ITodoAppSession> {
  // Authorization: authenticated user must match the requested owner
  if (props.todoUser.id !== props.userId) {
    // Do not leak existence; deny access
    throw new HttpException("Forbidden", 403);
  }

  // Fetch the session scoped to owner and excluding soft-deleted records
  const row = await MyGlobal.prisma.todo_app_sessions.findFirst({
    where: {
      id: props.sessionId,
      todo_app_user_id: props.userId,
      deleted_at: null,
    },
  });

  if (!row) {
    // Do not leak existence; return not found semantics
    throw new HttpException("Not Found", 404);
  }

  // Build response using branded input ids to avoid assertions
  return {
    id: props.sessionId,
    todo_app_user_id: props.userId,
    ip: row.ip ?? null,
    user_agent: row.user_agent ?? null,
    issued_at: toISOStringSafe(row.issued_at),
    expires_at: toISOStringSafe(row.expires_at),
    revoked_at: row.revoked_at ? toISOStringSafe(row.revoked_at) : null,
    revoked_reason: row.revoked_reason ?? null,
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
    // deleted_at intentionally omitted (soft-deleted rows are filtered out)
  };
}
