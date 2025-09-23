import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppUserPreference } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserPreference";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

/**
 * Get user preferences (todo_app_user_preferences) for the specified userId.
 *
 * Retrieves the preference settings (timezone, locale, page_size) for the given
 * user from the todo_app_user_preferences table. This endpoint enforces
 * ownership: only the authenticated owner (todoUser) can access their own
 * preferences. Soft-deleted records (deleted_at not null) are excluded.
 *
 * @param props - Request properties
 * @param props.todoUser - Authenticated Todo User payload (owner)
 * @param props.userId - UUID of the user whose preferences are requested
 * @returns The ITodoAppUserPreference record for the specified user
 * @throws {HttpException} 403 when accessing another user's preferences
 * @throws {HttpException} 404 when no preferences exist for the user
 */
export async function gettodoAppTodoUserUsersUserIdPreferences(props: {
  todoUser: TodouserPayload;
  userId: string & tags.Format<"uuid">;
}): Promise<ITodoAppUserPreference> {
  const { todoUser, userId } = props;

  // Authorization: owner-only access
  if (todoUser.id !== userId) {
    throw new HttpException(
      "Forbidden: You can only access your own preferences",
      403,
    );
  }

  // Fetch active (non-deleted) preferences for the user
  const pref = await MyGlobal.prisma.todo_app_user_preferences.findFirst({
    where: {
      todo_app_user_id: userId,
      deleted_at: null,
    },
  });

  if (!pref) {
    throw new HttpException("Not Found", 404);
  }

  // Map to API structure with proper ISO date conversions
  return typia.assert<ITodoAppUserPreference>({
    id: pref.id,
    todo_app_user_id: pref.todo_app_user_id,
    timezone: pref.timezone,
    locale: pref.locale,
    page_size: pref.page_size,
    created_at: toISOStringSafe(pref.created_at),
    updated_at: toISOStringSafe(pref.updated_at),
    deleted_at: null,
  });
}
