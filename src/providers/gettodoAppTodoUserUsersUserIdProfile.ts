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
 * Get the user profile (todo_app_user_profiles) for the specified userId.
 *
 * Retrieves the profile associated with the given userId, enforcing that only
 * the authenticated owner (todoUser) can access their own profile. Excludes
 * soft-deleted records (deleted_at IS NOT NULL). If no profile exists, a 404 is
 * thrown.
 *
 * @param props - Request properties
 * @param props.todoUser - Authenticated todouser payload (owner context)
 * @param props.userId - UUID of the user whose profile is requested
 * @returns The user's profile record
 * @throws {HttpException} 403 when accessing another user's profile
 * @throws {HttpException} 404 when profile does not exist or is soft-deleted
 */
export async function gettodoAppTodoUserUsersUserIdProfile(props: {
  todoUser: TodouserPayload;
  userId: string & tags.Format<"uuid">;
}): Promise<ITodoAppUserProfile> {
  const { todoUser, userId } = props;

  // Authorization: only owner can access
  if (todoUser.id !== userId) {
    throw new HttpException(
      "Unauthorized: You can only access your own profile",
      403,
    );
  }

  // Fetch profile by unique FK, excluding soft-deleted
  const profile = await MyGlobal.prisma.todo_app_user_profiles.findFirst({
    where: {
      todo_app_user_id: userId,
      deleted_at: null,
    },
    select: {
      id: true,
      todo_app_user_id: true,
      full_name: true,
      nickname: true,
      avatar_uri: true,
      created_at: true,
      updated_at: true,
      deleted_at: true,
    },
  });

  if (!profile) {
    throw new HttpException("Not Found", 404);
  }

  // Map to API structure with proper date conversions and optional handling
  return {
    id: profile.id as string & tags.Format<"uuid">,
    todo_app_user_id: profile.todo_app_user_id as string & tags.Format<"uuid">,
    full_name: profile.full_name ?? undefined,
    nickname: profile.nickname ?? undefined,
    avatar_uri: profile.avatar_uri ?? undefined,
    created_at: toISOStringSafe(profile.created_at),
    updated_at: toISOStringSafe(profile.updated_at),
    deleted_at: profile.deleted_at ? toISOStringSafe(profile.deleted_at) : null,
  };
}
