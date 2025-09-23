import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppUserPreference } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserPreference";

/**
 * Deny cross-user creation of user preferences while allowing same-user
 * creation.
 *
 * Business context:
 *
 * - Each todoUser may have at most one preference record, owned by that user.
 * - Only the authenticated owner can create their own preferences; cross-user
 *   attempts must be rejected.
 *
 * Test workflow:
 *
 * 1. Create two isolated auth contexts: User A (connA) and User B (connB) via join
 *    endpoint.
 * 2. Baseline success: User A creates preferences for self.
 * 3. Negative: While authenticated as User A, attempt to create preferences for
 *    User B (should error).
 * 4. Side-effect guard: User B creates preferences for self successfully (proves
 *    cross-user attempt did not create anything).
 *
 * Validations:
 *
 * - Typia.assert on all non-void responses for perfect structural checks.
 * - Business rule checks via TestValidator.equals on owner field
 *   (todo_app_user_id).
 * - Error path validated with TestValidator.error (no status code dependency).
 */
export async function test_api_user_preferences_creation_cross_user_access_denied(
  connection: api.IConnection,
) {
  // Prepare isolated connections so that tokens don't override each other
  const connA: api.IConnection = { ...connection, headers: {} };
  const connB: api.IConnection = { ...connection, headers: {} };

  // 1) Register User A
  const joinBodyA = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const userA: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connA, { body: joinBodyA });
  typia.assert(userA);

  // 2) Register User B
  const joinBodyB = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const userB: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connB, { body: joinBodyB });
  typia.assert(userB);

  // 3) Positive control: A creates preferences for self
  const prefBodyA = {
    timezone: "Asia/Seoul",
    locale: "en-US",
    page_size: 20,
  } satisfies ITodoAppUserPreference.ICreate;
  const prefA: ITodoAppUserPreference =
    await api.functional.todoApp.todoUser.users.preferences.create(connA, {
      userId: userA.id,
      body: prefBodyA,
    });
  typia.assert(prefA);
  TestValidator.equals(
    "A's preference record belongs to A",
    prefA.todo_app_user_id,
    userA.id,
  );

  // 4) Negative: A attempts cross-user creation for B → must be denied
  const crossPrefBody = {
    timezone: "Asia/Tokyo",
    locale: "en-US",
    page_size: 30,
  } satisfies ITodoAppUserPreference.ICreate;
  await TestValidator.error(
    "cross-user creation should be denied (A cannot create B's preferences)",
    async () => {
      await api.functional.todoApp.todoUser.users.preferences.create(connA, {
        userId: userB.id,
        body: crossPrefBody,
      });
    },
  );

  // 5) Side-effect guard: B creates preferences for self → should succeed
  const prefBodyB = {
    timezone: "Asia/Seoul",
    locale: "en-US",
    page_size: 25,
  } satisfies ITodoAppUserPreference.ICreate;
  const prefB: ITodoAppUserPreference =
    await api.functional.todoApp.todoUser.users.preferences.create(connB, {
      userId: userB.id,
      body: prefBodyB,
    });
  typia.assert(prefB);
  TestValidator.equals(
    "B's preference record belongs to B",
    prefB.todo_app_user_id,
    userB.id,
  );
}
