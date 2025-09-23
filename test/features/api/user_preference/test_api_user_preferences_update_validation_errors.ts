import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppUserPreference } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserPreference";

/**
 * Validate user preference update rejects invalid inputs and preserves state.
 *
 * Workflow:
 *
 * 1. Join as a todoUser and obtain userId (authorization handled by SDK).
 * 2. Create initial preferences with valid values (timezone, locale, page_size).
 * 3. Attempt invalid updates that should fail:
 *
 *    - Timezone: "Invalid/Zone"
 *    - Locale: "en_US" (underscore)
 *    - Page_size: 0 and 1000 (outside 1–100)
 * 4. After each failed attempt, perform a valid update and verify:
 *
 *    - Only targeted field changes
 *    - Unaffected fields remain equal to the last successful state
 *
 * Notes:
 *
 * - Error validation uses TestValidator.error without asserting specific HTTP
 *   status codes.
 * - All responses are validated with typia.assert.
 */
export async function test_api_user_preferences_update_validation_errors(
  connection: api.IConnection,
) {
  // 1) Join as todoUser (register + authenticate)
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12); // 8–64 chars policy
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: {
      email,
      password,
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authorized);

  // 2) Create initial preferences (valid)
  const initialBody = {
    timezone: "Asia/Seoul",
    locale: "en-US",
    page_size: 20,
  } satisfies ITodoAppUserPreference.ICreate;
  const pref0 = await api.functional.todoApp.todoUser.users.preferences.create(
    connection,
    {
      userId: authorized.id,
      body: initialBody,
    },
  );
  typia.assert(pref0);

  // 3-a) Invalid update: timezone
  await TestValidator.error("reject invalid timezone string", async () => {
    await api.functional.todoApp.todoUser.users.preferences.update(connection, {
      userId: authorized.id,
      body: {
        timezone: "Invalid/Zone",
      } satisfies ITodoAppUserPreference.IUpdate,
    });
  });

  // Follow-up valid update: change locale, others unchanged
  const pref1 = await api.functional.todoApp.todoUser.users.preferences.update(
    connection,
    {
      userId: authorized.id,
      body: { locale: "ko-KR" } satisfies ITodoAppUserPreference.IUpdate,
    },
  );
  typia.assert(pref1);
  TestValidator.equals(
    "timezone unchanged after failed timezone update",
    pref1.timezone,
    pref0.timezone,
  );
  TestValidator.equals(
    "page_size unchanged after failed timezone update",
    pref1.page_size,
    pref0.page_size,
  );
  TestValidator.equals("locale updated to ko-KR", pref1.locale, "ko-KR");

  // 3-b) Invalid update: locale with underscore
  await TestValidator.error(
    "reject locale using underscore separator",
    async () => {
      await api.functional.todoApp.todoUser.users.preferences.update(
        connection,
        {
          userId: authorized.id,
          body: { locale: "en_US" } satisfies ITodoAppUserPreference.IUpdate,
        },
      );
    },
  );

  // Follow-up valid update: change page_size, others unchanged
  const pref2 = await api.functional.todoApp.todoUser.users.preferences.update(
    connection,
    {
      userId: authorized.id,
      body: { page_size: 50 } satisfies ITodoAppUserPreference.IUpdate,
    },
  );
  typia.assert(pref2);
  TestValidator.equals("page_size updated to 50", pref2.page_size, 50);
  TestValidator.equals(
    "timezone still original after invalid locale update",
    pref2.timezone,
    pref0.timezone,
  );
  TestValidator.equals(
    "locale preserved as ko-KR after invalid locale update",
    pref2.locale,
    pref1.locale,
  );

  // 3-c) Invalid updates: page_size below min and above max
  await TestValidator.error("reject page_size below minimum", async () => {
    await api.functional.todoApp.todoUser.users.preferences.update(connection, {
      userId: authorized.id,
      body: { page_size: 0 } satisfies ITodoAppUserPreference.IUpdate,
    });
  });
  await TestValidator.error("reject page_size above maximum", async () => {
    await api.functional.todoApp.todoUser.users.preferences.update(connection, {
      userId: authorized.id,
      body: { page_size: 1000 } satisfies ITodoAppUserPreference.IUpdate,
    });
  });

  // Final follow-up valid update: change timezone, others unchanged
  const pref3 = await api.functional.todoApp.todoUser.users.preferences.update(
    connection,
    {
      userId: authorized.id,
      body: { timezone: "UTC" } satisfies ITodoAppUserPreference.IUpdate,
    },
  );
  typia.assert(pref3);
  TestValidator.equals("timezone updated to UTC", pref3.timezone, "UTC");
  TestValidator.equals(
    "locale preserved after timezone update",
    pref3.locale,
    pref2.locale,
  );
  TestValidator.equals(
    "page_size preserved after timezone update",
    pref3.page_size,
    pref2.page_size,
  );
}
