import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppSessionRevocation } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSessionRevocation";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

/**
 * Get session revocation details (todo_app_session_revocations) for a session
 *
 * Retrieve the revocation record for a specific session. Enforces ownership by
 * verifying the session belongs to the authenticated todo user. Returns 404
 * when no revocation exists for the session.
 *
 * Security: Only the session owner can access its revocation details.
 *
 * @param props - Request properties
 * @param props.todoUser - Authenticated TodoUser payload (owner candidate)
 * @param props.sessionId - Target session’s UUID
 * @returns Revocation record associated with the session
 * @throws {HttpException} 403 when accessing another user's session
 * @throws {HttpException} 404 when the session has no revocation record or
 *   session not found
 */
export async function gettodoAppTodoUserSessionsSessionIdRevocation(props: {
  todoUser: TodouserPayload;
  sessionId: string & tags.Format<"uuid">;
}): Promise<ITodoAppSessionRevocation> {
  const { todoUser, sessionId } = props;

  // 1) Authorize ownership by loading the session and verifying owner
  const session = await MyGlobal.prisma.todo_app_sessions.findUnique({
    where: { id: sessionId },
    select: { id: true, todo_app_user_id: true },
  });
  if (!session) {
    throw new HttpException("Not Found", 404);
  }
  if (session.todo_app_user_id !== todoUser.id) {
    throw new HttpException(
      "Forbidden: You can only access revocation details of your own session",
      403,
    );
  }

  // 2) Find revocation record (ignore soft-deleted rows)
  const revocation =
    await MyGlobal.prisma.todo_app_session_revocations.findFirst({
      where: {
        todo_app_session_id: sessionId,
        deleted_at: null,
      },
    });
  if (!revocation) {
    throw new HttpException("Not Found", 404);
  }

  // 3) Map to DTO with proper date conversions
  return {
    id: revocation.id as string & tags.Format<"uuid">,
    todo_app_session_id: revocation.todo_app_session_id as string &
      tags.Format<"uuid">,
    revoked_at: toISOStringSafe(revocation.revoked_at),
    revoked_by: revocation.revoked_by,
    reason: revocation.reason ?? null,
    created_at: toISOStringSafe(revocation.created_at),
    updated_at: toISOStringSafe(revocation.updated_at),
    deleted_at: revocation.deleted_at
      ? toISOStringSafe(revocation.deleted_at)
      : null,
  };
}
