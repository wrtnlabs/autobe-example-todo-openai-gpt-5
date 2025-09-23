import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppPasswordReset } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPasswordReset";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

/**
 * Get a specific password reset (todo_app_password_resets) for a user.
 *
 * Retrieves a password reset record by its ID, ensuring that only the owning
 * authenticated todoUser can access it. Ownership is verified either by direct
 * FK (todo_app_user_id) or, when nullable, by matching the record's email with
 * the owner's email. Soft-deleted records are excluded.
 *
 * Security: The authenticated user (todoUser) must match the path userId. If
 * not owned or not found, a privacy-preserving Not Found/Forbidden is thrown.
 *
 * @param props - Request properties
 * @param props.todoUser - Authenticated Todo User payload
 * @param props.userId - Owner user’s UUID (path param)
 * @param props.passwordResetId - Password reset record UUID (path param)
 * @returns ITodoAppPasswordReset safe metadata (no token/token_hash exposure)
 * @throws {HttpException} 403 when authenticated user mismatches path userId
 * @throws {HttpException} 404 when record not found for owner or soft-deleted
 */
export async function gettodoAppTodoUserUsersUserIdPasswordResetsPasswordResetId(props: {
  todoUser: TodouserPayload;
  userId: string & tags.Format<"uuid">;
  passwordResetId: string & tags.Format<"uuid">;
}): Promise<ITodoAppPasswordReset> {
  const { todoUser, userId, passwordResetId } = props;

  // Authorization: caller must be the owner referenced by path
  if (todoUser.id !== userId) {
    throw new HttpException("Forbidden", 403);
  }

  // Resolve owner's email (for privacy-preserving matching when FK is null)
  const owner = await MyGlobal.prisma.todo_app_users.findUniqueOrThrow({
    where: { id: userId },
  });
  if (owner.deleted_at !== null) {
    throw new HttpException("Forbidden", 403);
  }

  // Fetch record by id with ownership and soft-delete constraints
  const record = await MyGlobal.prisma.todo_app_password_resets.findFirst({
    where: {
      id: passwordResetId,
      deleted_at: null,
      OR: [
        { todo_app_user_id: userId },
        {
          AND: [{ todo_app_user_id: null }, { email: owner.email }],
        },
      ],
    },
  });

  if (record === null) {
    throw new HttpException("Not Found", 404);
  }

  // Map to safe DTO; convert all DateTime values using toISOStringSafe
  const output = {
    id: record.id,
    todo_app_user_id: record.todo_app_user_id ?? null,
    email: record.email,
    requested_at: toISOStringSafe(record.requested_at),
    expires_at: toISOStringSafe(record.expires_at),
    consumed_at: record.consumed_at
      ? toISOStringSafe(record.consumed_at)
      : null,
    requested_by_ip: record.requested_by_ip ?? null,
    created_at: toISOStringSafe(record.created_at),
    updated_at: toISOStringSafe(record.updated_at),
  };

  // Ensure DTO branding without using type assertions
  return typia.assert<ITodoAppPasswordReset>(output);
}
