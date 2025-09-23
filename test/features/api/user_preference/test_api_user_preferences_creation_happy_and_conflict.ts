import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppUserPreference } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserPreference";

/**
 * Create preferences for an authenticated todoUser and verify uniqueness (1:1).
 *
 * Steps:
 *
 * 1. Register a todoUser account (join) to obtain authenticated context and user
 *    id.
 * 2. Create preferences for that user with concrete values (timezone, locale,
 *    page_size).
 * 3. Validate the response type and, when connected to a real backend, verify
 *    ownership and value echo.
 * 4. Attempt creating preferences again to verify the 1:1 uniqueness constraint
 *    causes an error (real backend only).
 */
export async function test_api_user_preferences_creation_happy_and_conflict(
  connection: api.IConnection,
) {
  // 1) Authenticate (join) as todoUser
  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: typia.random<ITodoAppTodoUser.ICreate>(),
    });
  typia.assert(authorized);

  // 2) Prepare preference creation request
  const createBody = {
    timezone: "Asia/Seoul",
    locale: "en-US",
    page_size: 30,
  } satisfies ITodoAppUserPreference.ICreate;

  // 3) Create preferences for the authenticated user
  const created: ITodoAppUserPreference =
    await api.functional.todoApp.todoUser.users.preferences.create(connection, {
      userId: authorized.id,
      body: createBody,
    });
  typia.assert(created);

  // 4) Business validations (only against real backend; simulator returns random data)
  if (!connection.simulate) {
    TestValidator.equals(
      "preference.owner matches authenticated user",
      created.todo_app_user_id,
      authorized.id,
    );
    TestValidator.equals(
      "timezone persisted",
      created.timezone,
      createBody.timezone,
    );
    TestValidator.equals("locale persisted", created.locale, createBody.locale);
    TestValidator.equals(
      "page_size persisted",
      created.page_size,
      createBody.page_size,
    );

    // 5) Uniqueness: second POST should fail (conflict)
    await TestValidator.error(
      "second preferences creation must fail due to 1:1 uniqueness",
      async () => {
        await api.functional.todoApp.todoUser.users.preferences.create(
          connection,
          {
            userId: authorized.id,
            body: {
              timezone: "Asia/Tokyo",
              locale: "en-US",
              page_size: 25,
            } satisfies ITodoAppUserPreference.ICreate,
          },
        );
      },
    );
  }
}
