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
 * Update an existing user preference record (todo_app_user_preferences).
 *
 * Allows an authenticated todoUser to update their own preferences (timezone,
 * locale, page_size). Enforces 1:1 ownership with todo_app_users, validates
 * inputs, updates updated_at, and returns the full preference record.
 *
 * Security: Only the owner (todoUser.id === userId) may update their
 * preferences.
 *
 * @param props - Request properties
 * @param props.todoUser - Authenticated todo user payload (owner principal)
 * @param props.userId - UUID of the user whose preferences are being updated
 * @param props.body - Partial update payload for timezone, locale, and
 *   page_size
 * @returns The updated ITodoAppUserPreference object
 * @throws {HttpException} 403 when attempting to modify another user's
 *   preferences
 * @throws {HttpException} 404 when preference record does not exist for the
 *   user
 * @throws {HttpException} 400 when validation fails for provided fields
 */
export async function puttodoAppTodoUserUsersUserIdPreferences(props: {
  todoUser: TodouserPayload;
  userId: string & tags.Format<"uuid">;
  body: ITodoAppUserPreference.IUpdate;
}): Promise<ITodoAppUserPreference> {
  const { todoUser, userId, body } = props;

  // Authorization: owner-only
  if (todoUser.id !== userId) {
    throw new HttpException(
      "Forbidden: You can only update your own preferences",
      403,
    );
  }

  // Fetch existing preference (must exist, not soft-deleted)
  const existing = await MyGlobal.prisma.todo_app_user_preferences.findFirst({
    where: {
      todo_app_user_id: userId,
      deleted_at: null,
    },
  });
  if (!existing) {
    throw new HttpException("Not Found: Preference record does not exist", 404);
  }

  // Validation helpers (no Date usage)
  const isValidTimeZone = (tz: string): boolean => {
    if (tz.trim().length === 0) return false;
    try {
      // Prefer modern API when available
      const anyIntl = Intl as unknown as {
        supportedValuesOf?: (key: string) => string[];
      };
      if (typeof anyIntl.supportedValuesOf === "function") {
        const zones = anyIntl.supportedValuesOf("timeZone");
        if (Array.isArray(zones)) return zones.includes(tz);
      }
    } catch {
      // ignore
    }
    try {
      // Fallback: constructing formatter with given timeZone throws when invalid
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  };

  const isValidLocale = (loc: string): boolean => {
    if (loc.length < 2 || loc.length > 35) return false;
    if (loc.includes("_")) return false; // reject underscore variant like en_US
    const pattern = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
    if (!pattern.test(loc)) return false;
    try {
      // Ensure it’s a canonicalizable tag; do not auto-canonicalize value
      const arr = Intl.getCanonicalLocales(loc);
      return Array.isArray(arr) && arr.length === 1;
    } catch {
      return false;
    }
  };

  // Field-level validations only for provided non-null values
  if (body.timezone !== undefined && body.timezone !== null) {
    if (!isValidTimeZone(body.timezone)) {
      throw new HttpException("Bad Request: Invalid timezone identifier", 400);
    }
  }
  if (body.locale !== undefined && body.locale !== null) {
    if (!isValidLocale(body.locale)) {
      throw new HttpException(
        "Bad Request: Invalid locale (must be BCP 47, e.g., en-US)",
        400,
      );
    }
  }
  if (body.page_size !== undefined && body.page_size !== null) {
    const n = body.page_size;
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      throw new HttpException(
        "Bad Request: page_size must be an integer between 1 and 100",
        400,
      );
    }
  }

  // Update
  const now = toISOStringSafe(new Date());
  const updated = await MyGlobal.prisma.todo_app_user_preferences.update({
    where: { id: existing.id },
    data: {
      timezone:
        body.timezone === null ? undefined : (body.timezone ?? undefined),
      locale: body.locale === null ? undefined : (body.locale ?? undefined),
      page_size:
        body.page_size === null ? undefined : (body.page_size ?? undefined),
      updated_at: now,
    },
  });

  // Map to DTO with ISO strings for DateTime fields
  return {
    id: updated.id,
    todo_app_user_id: updated.todo_app_user_id,
    timezone: updated.timezone,
    locale: updated.locale,
    page_size: updated.page_size,
    created_at: toISOStringSafe(updated.created_at),
    updated_at: now,
    deleted_at: updated.deleted_at ? toISOStringSafe(updated.deleted_at) : null,
  };
}
