import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppUserPreference } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserPreference";

/**
 * Read own preferences successfully after creation.
 *
 * Scenario:
 *
 * 1. Register and authenticate a todoUser (join) and capture userId.
 * 2. Create preferences for that user with timezone="Asia/Seoul", locale="en-US",
 *    page_size=20.
 * 3. Read preferences via GET and validate values match the created record.
 * 4. Business checks only (no type validation beyond typia.assert):
 *
 *    - Owner FK matches userId
 *    - Timezone/locale/page_size are preserved
 *    - Created and fetched records refer to the same id
 * 5. Negative checks (business errors):
 *
 *    - Unauthenticated fetch must fail
 *    - Cross-user fetch must fail
 */
export async function test_api_user_preferences_read_success(
  connection: api.IConnection,
) {
  // 1) Register and authenticate (join)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBody });
  typia.assert(authorized);
  const userId = authorized.id;

  // 2) Create preferences for the authenticated user
  const createPrefBody = {
    timezone: "Asia/Seoul",
    locale: "en-US",
    page_size: 20,
  } satisfies ITodoAppUserPreference.ICreate;
  const created: ITodoAppUserPreference =
    await api.functional.todoApp.todoUser.users.preferences.create(connection, {
      userId,
      body: createPrefBody,
    });
  typia.assert(created);

  // Validate creation results
  TestValidator.equals(
    "created: owner foreign key equals user id",
    created.todo_app_user_id,
    userId,
  );
  TestValidator.equals(
    "created: timezone equals requested value",
    created.timezone,
    createPrefBody.timezone,
  );
  TestValidator.equals(
    "created: locale equals requested value",
    created.locale,
    createPrefBody.locale,
  );
  TestValidator.equals(
    "created: page_size equals requested value",
    created.page_size,
    createPrefBody.page_size,
  );

  // 3) Read preferences
  const fetched: ITodoAppUserPreference =
    await api.functional.todoApp.todoUser.users.preferences.at(connection, {
      userId,
    });
  typia.assert(fetched);

  // 4) Validate fetched values
  TestValidator.equals(
    "fetched: same record id as created",
    fetched.id,
    created.id,
  );
  TestValidator.equals(
    "fetched: owner foreign key equals user id",
    fetched.todo_app_user_id,
    userId,
  );
  TestValidator.equals(
    "fetched: timezone equals created",
    fetched.timezone,
    createPrefBody.timezone,
  );
  TestValidator.equals(
    "fetched: locale equals created",
    fetched.locale,
    createPrefBody.locale,
  );
  TestValidator.equals(
    "fetched: page_size equals created",
    fetched.page_size,
    createPrefBody.page_size,
  );

  // 5) Negative/permission checks (business errors only)
  // 5-a) Unauthenticated access must fail
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated user cannot read preferences",
    async () => {
      await api.functional.todoApp.todoUser.users.preferences.at(unauthConn, {
        userId,
      });
    },
  );

  // 5-b) Cross-user access must fail (join creates a different authenticated subject)
  const otherJoin = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const otherAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: otherJoin });
  typia.assert(otherAuth);

  await TestValidator.error(
    "other user cannot read preferences of the first user",
    async () => {
      await api.functional.todoApp.todoUser.users.preferences.at(connection, {
        userId, // first user's id
      });
    },
  );
}
