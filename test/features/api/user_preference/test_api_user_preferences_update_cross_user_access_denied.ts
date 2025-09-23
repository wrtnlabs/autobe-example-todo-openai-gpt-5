import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppUserPreference } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserPreference";

export async function test_api_user_preferences_update_cross_user_access_denied(
  connection: api.IConnection,
) {
  /**
   * Validate that a user cannot update another user's preferences.
   *
   * Steps:
   *
   * 1. Create two independent authenticated contexts by joining twice (User A,
   *    User B).
   * 2. With User B's context, create preferences for B.
   * 3. With User A's context, attempt to update B's preferences and expect an
   *    error.
   * 4. With User B's context, update preferences successfully and validate
   *    changes.
   */

  // 1) Prepare independent authenticated contexts
  const connA: api.IConnection = { ...connection, headers: {} }; // Do not touch further; SDK manages headers
  const connB: api.IConnection = { ...connection, headers: {} };

  const userA: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connA, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(userA);

  const userB: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connB, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(userB);

  // 2) User B creates their preferences
  const createBody = {
    timezone: "Asia/Seoul",
    locale: "en-US",
    page_size: 20,
  } satisfies ITodoAppUserPreference.ICreate;

  const prefB = await api.functional.todoApp.todoUser.users.preferences.create(
    connB,
    {
      userId: userB.id,
      body: createBody,
    },
  );
  typia.assert(prefB);
  TestValidator.equals(
    "preference ownership must match user B",
    prefB.todo_app_user_id,
    userB.id,
  );

  // 3) Cross-user update attempt by User A against User B's preferences
  const crossUpdateBody = {
    timezone: "Europe/Berlin",
    locale: "de-DE",
    page_size: 30,
  } satisfies ITodoAppUserPreference.IUpdate;

  await TestValidator.error("cross-user update must be denied", async () => {
    await api.functional.todoApp.todoUser.users.preferences.update(connA, {
      userId: userB.id,
      body: crossUpdateBody,
    });
  });

  // 4) Positive control: owner (User B) can update successfully
  const newTimezone = "America/New_York";
  const newLocale = "en-US";
  const newPageSize = 25;
  const ownerUpdateBody = {
    timezone: newTimezone,
    locale: newLocale,
    page_size: newPageSize,
  } satisfies ITodoAppUserPreference.IUpdate;

  const updatedPrefB =
    await api.functional.todoApp.todoUser.users.preferences.update(connB, {
      userId: userB.id,
      body: ownerUpdateBody,
    });
  typia.assert(updatedPrefB);

  // Validate identities remain stable
  TestValidator.equals(
    "preference id remains stable after update",
    updatedPrefB.id,
    prefB.id,
  );
  TestValidator.equals(
    "owner id remains unchanged",
    updatedPrefB.todo_app_user_id,
    userB.id,
  );

  // Validate fields updated as requested
  TestValidator.equals(
    "timezone updated by owner",
    updatedPrefB.timezone,
    newTimezone,
  );
  TestValidator.equals(
    "locale updated by owner",
    updatedPrefB.locale,
    newLocale,
  );
  TestValidator.equals(
    "page_size updated by owner",
    updatedPrefB.page_size,
    newPageSize,
  );

  // Validate updated_at changed
  TestValidator.notEquals(
    "updated_at must be changed after update",
    updatedPrefB.updated_at,
    prefB.updated_at,
  );
}
