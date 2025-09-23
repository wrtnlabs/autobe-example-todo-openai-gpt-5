import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

/**
 * Logically delete user preferences (todo_app_user_preferences) by userId.
 *
 * Marks the owner's preferences record as deleted by setting deleted_at to the
 * current timestamp. Operation is idempotent: if no active record exists, it
 * still succeeds. Ownership is strictly enforced; only the authenticated
 * todoUser matching the path userId may perform this deletion. Cross-user
 * attempts are denied without revealing whether a record exists.
 *
 * @param props - Request properties
 * @param props.todoUser - Authenticated todoUser payload (must match userId)
 * @param props.userId - UUID of the preferences owner
 * @returns Void
 * @throws {HttpException} 401 when unauthenticated (missing payload)
 * @throws {HttpException} 403 when the authenticated user does not own userId
 */
export async function deletetodoAppTodoUserUsersUserIdPreferences(props: {
  todoUser: TodouserPayload;
  userId: string & tags.Format<"uuid">;
}): Promise<void> {
  const { todoUser, userId } = props;

  // Authorization: only the owner can delete their preferences
  if (!todoUser || todoUser.id !== userId) {
    throw new HttpException("Forbidden", 403);
  }

  // Prepare timestamps
  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());

  // Idempotent soft delete: mark deleted_at for active record, if any
  await MyGlobal.prisma.todo_app_user_preferences.updateMany({
    where: {
      todo_app_user_id: userId,
      deleted_at: null,
    },
    data: {
      deleted_at: now,
      updated_at: now,
    },
  });

  // No response body
  return;
}
