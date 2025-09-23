import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Non-admin cannot delete a Feature Flag.
 *
 * Business context:
 *
 * - Deleting feature flags is a privileged action reserved for systemAdmin role.
 * - Regular app members (todoUser) must be forbidden from this operation.
 *
 * Steps:
 *
 * 1. Register and authenticate as a todoUser via /auth/todoUser/join.
 * 2. Attempt to DELETE /todoApp/systemAdmin/featureFlags/{featureFlagId} with a
 *    random UUID.
 * 3. Validate that the operation fails (authorization error) without asserting
 *    specific status codes.
 */
export async function test_api_feature_flag_delete_forbidden_without_admin(
  connection: api.IConnection,
) {
  // 1) Authenticate as a regular todoUser (not an admin)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // 2) Prepare a random featureFlagId (UUID)
  const featureFlagId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();

  // 3) Attempt deletion as non-admin and expect an error (authorization failure)
  await TestValidator.error(
    "non-admin todoUser cannot delete a feature flag",
    async () => {
      await api.functional.todoApp.systemAdmin.featureFlags.erase(connection, {
        featureFlagId,
      });
    },
  );
}
