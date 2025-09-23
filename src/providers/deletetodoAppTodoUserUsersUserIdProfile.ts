import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

/**
 * Logically delete a user profile (todo_app_user_profiles) by userId.
 *
 * Performs a soft delete by setting deleted_at to the current timestamp for the
 * authenticated owner’s profile. Operation is idempotent: if no active profile
 * exists (either missing or already deleted), it succeeds without error. This
 * endpoint enforces that only the owner (todoUser) can delete their own profile
 * and does not reveal existence of the profile on cross-user attempts.
 *
 * @param props - Request properties
 * @param props.todoUser - Authenticated todo user payload (must own the
 *   profile)
 * @param props.userId - UUID of the user whose profile is targeted
 * @returns Void
 * @throws {HttpException} 403 Forbidden when caller is not the owner
 */
export async function deletetodoAppTodoUserUsersUserIdProfile(props: {
  todoUser: TodouserPayload;
  userId: string & tags.Format<"uuid">;
}): Promise<void> {
  const { todoUser, userId } = props;

  // Authorization: only the owner can delete their profile
  if (!todoUser || todoUser.id !== userId) {
    throw new HttpException("Forbidden", 403);
  }

  // Prepare a single timestamp; reuse for consistency
  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());

  // Idempotent soft delete of active (non-deleted) profile
  await MyGlobal.prisma.todo_app_user_profiles.updateMany({
    where: {
      todo_app_user_id: userId,
      deleted_at: null,
    },
    data: {
      deleted_at: now,
      updated_at: now,
    },
  });
}
