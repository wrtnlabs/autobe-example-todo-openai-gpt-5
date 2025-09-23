import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppUserPreference } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserPreference";

/**
 * Read preferences returns an error when absent (no implicit creation on GET).
 *
 * Scenario:
 *
 * 1. Register and authenticate a todoUser (no preferences exist yet).
 * 2. Immediately attempt to GET /todoApp/todoUser/users/{userId}/preferences.
 * 3. Validate that the call fails (business logic: not found). Do not assert HTTP
 *    status codes.
 *
 * Why necessary:
 *
 * - Ensures the service does not create default preferences implicitly on read.
 * - Confirms proper error path for consumers to handle first-time setup flows.
 */
export async function test_api_user_preferences_read_not_found_when_absent(
  connection: api.IConnection,
) {
  // 1) Register and authenticate a todoUser
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;

  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBody });
  typia.assert(authorized);

  // 2) Try reading preferences before any creation — must error
  await TestValidator.error(
    "reading preferences without prior creation must fail (no implicit creation)",
    async () => {
      await api.functional.todoApp.todoUser.users.preferences.at(connection, {
        userId: authorized.id,
      });
    },
  );
}
