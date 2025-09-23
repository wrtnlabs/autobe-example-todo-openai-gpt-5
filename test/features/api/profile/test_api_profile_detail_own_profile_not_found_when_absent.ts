import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppUserProfile } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserProfile";

export async function test_api_profile_detail_own_profile_not_found_when_absent(
  connection: api.IConnection,
) {
  /**
   * Validate that a newly registered todoUser receives an error when attempting
   * to read their own profile before any profile exists.
   *
   * Steps:
   *
   * 1. Register a todoUser (auth join) and get their authorized id.
   * 2. Invoke GET /todoApp/todoUser/users/{userId}/profile with the same
   *    authenticated context and the returned userId.
   * 3. Expect an error (not-found style) since the profile has not been created
   *    yet.
   */

  // 1) Register a todoUser and obtain authorized context
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // 8–64 chars policy satisfied
  } satisfies ITodoAppTodoUser.ICreate;

  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBody });
  typia.assert(authorized);
  // Optional: ensure token structure is correct as well
  typia.assert<IAuthorizationToken>(authorized.token);

  // 2) Attempt to get the user's own profile (which should not exist yet)
  await TestValidator.error(
    "fetching own profile should fail when profile does not exist",
    async () => {
      await api.functional.todoApp.todoUser.users.profile.at(connection, {
        userId: authorized.id,
      });
    },
  );
}
