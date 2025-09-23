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
 * Create a user preference record (todo_app_user_preferences) for the specified
 * user.
 *
 * This endpoint allows an authenticated todoUser to create their own preference
 * settings (timezone, locale, page_size). It enforces 1:1 ownership to
 * todo_app_users via todo_app_user_id and rejects creation if a record already
 * exists.
 *
 * Authorization: Only the authenticated owner (todoUser) may create preferences
 * for the matching path userId.
 *
 * @param props - Request properties
 * @param props.todoUser - Authenticated todo user payload (owner)
 * @param props.userId - Owner user’s UUID (path parameter)
 * @param props.body - Initial preference settings (timezone, locale, page_size)
 * @returns The created user preference record
 * @throws {HttpException} 403 when attempting to create for another user
 * @throws {HttpException} 400 when validation fails (timezone/locale/page_size)
 * @throws {HttpException} 409 when a preference record already exists for the
 *   user
 */
export async function posttodoAppTodoUserUsersUserIdPreferences(props: {
  todoUser: TodouserPayload;
  userId: string & tags.Format<"uuid">;
  body: ITodoAppUserPreference.ICreate;
}): Promise<ITodoAppUserPreference> {
  const { todoUser, userId, body } = props;

  // Authorization: only owner can create
  if (todoUser.id !== userId) {
    throw new HttpException(
      "Forbidden: You can only create preferences for your own account",
      403,
    );
  }

  // Basic validations
  const isValidTimeZone = (tz: string): boolean => {
    try {
      // Throws RangeError for invalid time zones
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  };
  const isValidLocale = (locale: string): boolean => {
    try {
      // Throws on invalid BCP 47; returns canonicalized list otherwise
      return Intl.getCanonicalLocales(locale).length === 1;
    } catch {
      return false;
    }
  };

  if (!isValidTimeZone(body.timezone)) {
    throw new HttpException("Bad Request: Invalid IANA timezone", 400);
  }
  if (!isValidLocale(body.locale)) {
    throw new HttpException(
      "Bad Request: Invalid locale (must be BCP 47)",
      400,
    );
  }
  if (!(body.page_size >= 1 && body.page_size <= 100)) {
    throw new HttpException(
      "Bad Request: page_size must be between 1 and 100",
      400,
    );
  }

  // Reject if preference already exists (1:1 uniqueness)
  const existing = await MyGlobal.prisma.todo_app_user_preferences.findFirst({
    where: { todo_app_user_id: userId },
  });
  if (existing) {
    throw new HttpException(
      "Conflict: Preferences already exist for this user",
      409,
    );
  }

  // Optional guard: ensure owner user exists (FK will enforce as well)
  await MyGlobal.prisma.todo_app_users.findUniqueOrThrow({
    where: { id: userId },
  });

  const id = v4() as string & tags.Format<"uuid">;
  const now = toISOStringSafe(new Date());

  try {
    await MyGlobal.prisma.todo_app_user_preferences.create({
      data: {
        id,
        todo_app_user_id: userId,
        timezone: body.timezone,
        locale: body.locale,
        page_size: body.page_size,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Unique constraint violation on todo_app_user_id
      throw new HttpException(
        "Conflict: Preferences already exist for this user",
        409,
      );
    }
    throw err;
  }

  return {
    id,
    todo_app_user_id: userId,
    timezone: body.timezone,
    locale: body.locale,
    page_size: body.page_size,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}
