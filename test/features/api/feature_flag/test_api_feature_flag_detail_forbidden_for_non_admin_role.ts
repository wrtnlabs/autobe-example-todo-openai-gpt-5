import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppFeatureFlag } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppFeatureFlag";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Verify non-admin (todoUser) cannot read system-admin feature flag details.
 *
 * Context
 *
 * - Feature flag administration endpoints are restricted to systemAdmin role.
 * - A regular todoUser must be denied when trying to read a feature flag detail
 *   via the admin path.
 *
 * Steps
 *
 * 1. Register (join) as a todoUser using valid credentials.
 * 2. Attempt GET /todoApp/systemAdmin/featureFlags/{featureFlagId} while
 *    authenticated as todoUser.
 * 3. Validate that the request fails with an error (authorization enforced). We do
 *    not assert specific HTTP status codes per testing policy.
 */
export async function test_api_feature_flag_detail_forbidden_for_non_admin_role(
  connection: api.IConnection,
) {
  // 1) Authenticate as a non-admin todoUser
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;

  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBody });
  typia.assert(authorized);
  // (Optional) ensure token shape
  typia.assert<IAuthorizationToken>(authorized.token);

  // 2) Attempt to access admin-only feature flag detail with todoUser token
  const randomFeatureFlagId = typia.random<string & tags.Format<"uuid">>();
  await TestValidator.error(
    "todoUser cannot access systemAdmin feature flag detail",
    async () => {
      await api.functional.todoApp.systemAdmin.featureFlags.at(connection, {
        featureFlagId: randomFeatureFlagId,
      });
    },
  );

  // 3) Consistency check with another random UUID (regardless of resource existence)
  const anotherId = typia.random<string & tags.Format<"uuid">>();
  await TestValidator.error(
    "access is denied regardless of featureFlag existence (second try)",
    async () => {
      await api.functional.todoApp.systemAdmin.featureFlags.at(connection, {
        featureFlagId: anotherId,
      });
    },
  );
}
