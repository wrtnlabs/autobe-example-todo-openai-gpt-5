import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppUserPreference } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserPreference";

/**
 * Cross-user preference read must be denied while owner read succeeds.
 *
 * Workflow:
 *
 * 1. Create two separate authenticated users (User A and User B) using two
 *    independent connections so that Authorization headers do not conflict.
 * 2. In User B context, create a preference record with valid values.
 * 3. Verify User B can read their own preferences successfully and fields match
 *    input (ownership and persisted attributes).
 * 4. In User A context, attempt to read User B's preferences and expect an error
 *    (permission denied). Do not assert specific HTTP status codes.
 */
export async function test_api_user_preferences_read_cross_user_access_denied(
  connection: api.IConnection,
) {
  // Prepare isolated connections for User A and User B
  const connA: api.IConnection = { ...connection, headers: {} };
  const connB: api.IConnection = { ...connection, headers: {} };

  // 1) Register User A
  const joinBodyA = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const userA: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connA, { body: joinBodyA });
  typia.assert(userA);

  // 2) Register User B
  const joinBodyB = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const userB: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connB, { body: joinBodyB });
  typia.assert(userB);

  // 3) In User B context, create preferences for B
  const prefCreateBodyB = {
    timezone: "Asia/Seoul",
    locale: "en-US",
    page_size: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<1> & tags.Maximum<100>
    >(),
  } satisfies ITodoAppUserPreference.ICreate;
  const createdPrefB: ITodoAppUserPreference =
    await api.functional.todoApp.todoUser.users.preferences.create(connB, {
      userId: userB.id,
      body: prefCreateBodyB,
    });
  typia.assert(createdPrefB);

  // Verify ownership and persisted fields
  TestValidator.equals(
    "created preference belongs to user B",
    createdPrefB.todo_app_user_id,
    userB.id,
  );
  TestValidator.equals(
    "timezone persisted for user B",
    createdPrefB.timezone,
    prefCreateBodyB.timezone,
  );
  TestValidator.equals(
    "locale persisted for user B",
    createdPrefB.locale,
    prefCreateBodyB.locale,
  );
  TestValidator.equals(
    "page_size persisted for user B",
    createdPrefB.page_size,
    prefCreateBodyB.page_size,
  );

  // 3b) Owner can read: User B reads their own preferences
  const readByB: ITodoAppUserPreference =
    await api.functional.todoApp.todoUser.users.preferences.at(connB, {
      userId: userB.id,
    });
  typia.assert(readByB);
  TestValidator.equals(
    "read-by-B returns the same record id",
    readByB.id,
    createdPrefB.id,
  );

  // 4) Cross-user denial: User A attempts to read User B's preferences
  await TestValidator.error(
    "user A cannot read user B's preferences",
    async () => {
      await api.functional.todoApp.todoUser.users.preferences.at(connA, {
        userId: userB.id,
      });
    },
  );
}
