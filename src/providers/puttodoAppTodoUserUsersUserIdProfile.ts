import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppUserProfile } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserProfile";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

/**
 * Update the user profile (todo_app_user_profiles) for the specified userId.
 *
 * Updates optional presentation fields (full_name, nickname, avatar_uri) on the
 * existing profile row linked by todo_app_user_id. Enforces ownership: only the
 * authenticated todoUser owning the profile (same userId) may update it. If the
 * profile does not exist or is soft-deleted, returns 404. Maintains audit
 * timestamps by updating updated_at.
 *
 * @param props - Request properties
 * @param props.todoUser - Authenticated todouser payload (owner must match
 *   userId)
 * @param props.userId - UUID of the user whose profile is to be updated
 * @param props.body - Update payload with optional fields to modify
 * @returns The updated user profile
 * @throws {HttpException} 403 when attempting to update another user's profile
 * @throws {HttpException} 404 when the profile does not exist (or is
 *   soft-deleted)
 */
export async function puttodoAppTodoUserUsersUserIdProfile(props: {
  todoUser: TodouserPayload;
  userId: string & tags.Format<"uuid">;
  body: ITodoAppUserProfile.IUpdate;
}): Promise<ITodoAppUserProfile> {
  const { todoUser, userId, body } = props;

  // Authorization: only owner can update
  if (todoUser.id !== userId) {
    throw new HttpException(
      "Forbidden: You can only update your own profile",
      403,
    );
  }

  // Ensure profile exists and is not soft-deleted
  const existing = await MyGlobal.prisma.todo_app_user_profiles.findFirst({
    where: {
      todo_app_user_id: userId,
      deleted_at: null,
    },
  });
  if (!existing) {
    throw new HttpException("Not Found: Profile does not exist", 404);
  }

  // Prepare timestamp once
  const now = toISOStringSafe(new Date());

  // Update only provided fields; allow explicit null to clear
  const updated = await MyGlobal.prisma.todo_app_user_profiles.update({
    where: { id: existing.id },
    data: {
      full_name: body.full_name === undefined ? undefined : body.full_name,
      nickname: body.nickname === undefined ? undefined : body.nickname,
      avatar_uri: body.avatar_uri === undefined ? undefined : body.avatar_uri,
      updated_at: now,
    },
  });

  // Map to API DTO with proper date conversions and branding
  return {
    id: updated.id as string & tags.Format<"uuid">,
    todo_app_user_id: updated.todo_app_user_id as string & tags.Format<"uuid">,
    full_name: updated.full_name ?? null,
    nickname: updated.nickname ?? null,
    avatar_uri: updated.avatar_uri ?? null,
    created_at: toISOStringSafe(updated.created_at),
    updated_at: now,
    deleted_at: updated.deleted_at ? toISOStringSafe(updated.deleted_at) : null,
  };
}
