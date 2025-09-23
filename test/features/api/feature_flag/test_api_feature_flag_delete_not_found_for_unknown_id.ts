import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Delete unknown feature flag must produce a not-found style error.
 *
 * Business goal:
 *
 * - Ensure that systemAdmin-protected delete endpoint for feature flags rejects
 *   deletion attempts against non-existent IDs without exposing details,
 *   following standard not-found semantics.
 *
 * Steps:
 *
 * 1. Register (join) as a system admin, which authenticates the connection.
 * 2. Call DELETE /todoApp/systemAdmin/featureFlags/{featureFlagId} with a random
 *    UUID assumed to be unknown in the system.
 * 3. Validate that the operation throws an error (no status-code checks).
 */
export async function test_api_feature_flag_delete_not_found_for_unknown_id(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin via join endpoint
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // >= 8 chars per policy
  } satisfies ITodoAppSystemAdminJoin.ICreate;

  const authorized: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // 2) Attempt to delete a feature flag with an unknown UUID
  const unknownId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();

  // 3) Expect an error (not-found semantics). Do not check specific status codes.
  await TestValidator.error(
    "deleting an unknown feature flag id should fail with not-found semantics",
    async () => {
      await api.functional.todoApp.systemAdmin.featureFlags.erase(connection, {
        featureFlagId: unknownId,
      });
    },
  );
}
