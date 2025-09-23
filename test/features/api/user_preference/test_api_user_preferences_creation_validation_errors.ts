import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppUserPreference } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserPreference";

/**
 * Validate that user preferences creation rejects invalid
 * timezone/locale/page_size inputs.
 *
 * Business context:
 *
 * - A todoUser can create a single preference record specifying timezone (IANA),
 *   locale (BCP 47), and page_size (1–100).
 * - This test focuses on invalid payload combinations to ensure server-side
 *   validation blocks creation.
 *
 * Steps:
 *
 * 1. Join as a todoUser to obtain an authenticated context and the owner userId
 * 2. Attempt to create preferences with invalid inputs (each in isolation),
 *    expecting errors:
 *
 *    - Invalid IANA timezone
 *    - Invalid locale format (underscore)
 *    - Page_size below minimum (0)
 *    - Page_size above maximum (1000)
 *
 * Notes:
 *
 * - Do not assert specific HTTP status codes or inspect error payloads; only
 *   assert that an error occurs.
 * - Headers are managed by the SDK; do not modify connection.headers.
 */
export async function test_api_user_preferences_creation_validation_errors(
  connection: api.IConnection,
) {
  // 1) Join as todoUser (authentication + acquire owner userId)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);

  const userId = authorized.id; // owner id for the path parameter
  const validTimezone = "Asia/Seoul";
  const validLocale = "en-US";
  const validPageSize = 20;

  // 2-a) Reject invalid IANA timezone
  await TestValidator.error(
    "reject invalid IANA timezone on preferences creation",
    async () => {
      await api.functional.todoApp.todoUser.users.preferences.create(
        connection,
        {
          userId,
          body: {
            timezone: "Invalid/Zone",
            locale: validLocale,
            page_size: validPageSize,
          } satisfies ITodoAppUserPreference.ICreate,
        },
      );
    },
  );

  // 2-b) Reject invalid locale format (underscore)
  await TestValidator.error(
    "reject invalid locale format (underscore) on preferences creation",
    async () => {
      await api.functional.todoApp.todoUser.users.preferences.create(
        connection,
        {
          userId,
          body: {
            timezone: validTimezone,
            locale: "en_US", // invalid per BCP 47 expectations
            page_size: validPageSize,
          } satisfies ITodoAppUserPreference.ICreate,
        },
      );
    },
  );

  // 2-c) Reject page_size below minimum (0)
  await TestValidator.error(
    "reject page_size below minimum (0) on preferences creation",
    async () => {
      await api.functional.todoApp.todoUser.users.preferences.create(
        connection,
        {
          userId,
          body: {
            timezone: validTimezone,
            locale: validLocale,
            page_size: 0,
          } satisfies ITodoAppUserPreference.ICreate,
        },
      );
    },
  );

  // 2-d) Reject page_size above maximum (1000)
  await TestValidator.error(
    "reject page_size above maximum (1000) on preferences creation",
    async () => {
      await api.functional.todoApp.todoUser.users.preferences.create(
        connection,
        {
          userId,
          body: {
            timezone: validTimezone,
            locale: validLocale,
            page_size: 1000,
          } satisfies ITodoAppUserPreference.ICreate,
        },
      );
    },
  );
}
