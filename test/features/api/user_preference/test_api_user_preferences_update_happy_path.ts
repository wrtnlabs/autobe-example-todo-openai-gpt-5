import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppUserPreference } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserPreference";

export async function test_api_user_preferences_update_happy_path(
  connection: api.IConnection,
) {
  // 1) Authenticate (join) as a todoUser and capture userId
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBody });
  typia.assert(authorized);

  // 2) Create initial preferences for this user
  const createBody = {
    timezone: "Asia/Seoul",
    locale: "en-US",
    page_size: 20,
  } satisfies ITodoAppUserPreference.ICreate;
  const created: ITodoAppUserPreference =
    await api.functional.todoApp.todoUser.users.preferences.create(connection, {
      userId: authorized.id,
      body: createBody,
    });
  typia.assert(created);

  // Sanity checks after creation
  TestValidator.equals(
    "owner id should match authorized user id after creation",
    created.todo_app_user_id,
    authorized.id,
  );
  TestValidator.equals(
    "initial timezone set to Asia/Seoul",
    created.timezone,
    "Asia/Seoul",
  );
  TestValidator.equals("initial locale set to en-US", created.locale, "en-US");
  TestValidator.equals("initial page_size set to 20", created.page_size, 20);

  const beforeUpdatedAt: number = Date.parse(created.updated_at);

  // 3) Update preferences: change timezone and page_size; keep locale
  const updateBody = {
    timezone: "America/Los_Angeles",
    locale: "en-US",
    page_size: 50,
  } satisfies ITodoAppUserPreference.IUpdate;
  const updated: ITodoAppUserPreference =
    await api.functional.todoApp.todoUser.users.preferences.update(connection, {
      userId: authorized.id,
      body: updateBody,
    });
  typia.assert(updated);

  // 4) Validate business outcomes
  TestValidator.equals(
    "preference id remains the same after update",
    updated.id,
    created.id,
  );
  TestValidator.equals(
    "owner id remains the same after update",
    updated.todo_app_user_id,
    created.todo_app_user_id,
  );
  TestValidator.equals(
    "timezone updated to America/Los_Angeles",
    updated.timezone,
    "America/Los_Angeles",
  );
  TestValidator.equals("page_size updated to 50", updated.page_size, 50);
  TestValidator.equals(
    "locale remains en-US after update",
    updated.locale,
    "en-US",
  );
  TestValidator.equals(
    "created_at remains unchanged after update",
    updated.created_at,
    created.created_at,
  );
  TestValidator.predicate(
    "updated_at strictly increases after update",
    Date.parse(updated.updated_at) > beforeUpdatedAt,
  );
}
