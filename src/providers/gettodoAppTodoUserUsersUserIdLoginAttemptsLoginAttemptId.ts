import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppLoginAttempt } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppLoginAttempt";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

/**
 * Get one login attempt (todo_app_login_attempts) for a user by id.
 *
 * Retrieves a single authentication login attempt record owned by the specified
 * user. Enforces ownership: only the authenticated owner can access their own
 * record. Records marked as soft-deleted (deleted_at not null) are not
 * returned.
 *
 * @param props - Request properties
 * @param props.todoUser - Authenticated todo user payload (owner context)
 * @param props.userId - Owner user identifier (todo_app_users.id)
 * @param props.loginAttemptId - Login attempt identifier
 *   (todo_app_login_attempts.id)
 * @returns Detailed login attempt information
 * @throws {HttpException} Not Found (404) when unauthorized, not owned,
 *   deleted, or nonexistent
 */
export async function gettodoAppTodoUserUsersUserIdLoginAttemptsLoginAttemptId(props: {
  todoUser: TodouserPayload;
  userId: string & tags.Format<"uuid">;
  loginAttemptId: string & tags.Format<"uuid">;
}): Promise<ITodoAppLoginAttempt> {
  const { todoUser, userId, loginAttemptId } = props;

  // Authorization: deny access unless the authenticated user matches the path userId
  if (todoUser.id !== userId) {
    // Do not reveal existence of other users' data
    throw new HttpException("Not Found", 404);
  }

  // Fetch owned record that is not soft-deleted
  const row = await MyGlobal.prisma.todo_app_login_attempts.findFirst({
    where: {
      id: loginAttemptId,
      todo_app_user_id: userId,
      deleted_at: null,
    },
    select: {
      id: true,
      todo_app_user_id: true,
      email: true,
      success: true,
      ip: true,
      user_agent: true,
      failure_reason: true,
      occurred_at: true,
      created_at: true,
      updated_at: true,
    },
  });

  if (row === null) {
    throw new HttpException("Not Found", 404);
  }

  return {
    id: row.id as string & tags.Format<"uuid">,
    todo_app_user_id:
      row.todo_app_user_id === null
        ? null
        : (row.todo_app_user_id as string & tags.Format<"uuid">),
    email: row.email as string & tags.Format<"email">,
    success: row.success,
    ip: row.ip,
    user_agent: row.user_agent ?? null,
    failure_reason: row.failure_reason ?? null,
    occurred_at: toISOStringSafe(row.occurred_at),
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
  };
}
