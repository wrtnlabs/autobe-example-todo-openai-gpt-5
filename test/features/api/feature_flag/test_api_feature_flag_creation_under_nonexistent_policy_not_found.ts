import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppFeatureFlag } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppFeatureFlag";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Attempt to create a feature flag under a non-existent policy; expect failure.
 *
 * Business flow and rationale:
 *
 * 1. Register (join) a system administrator account to obtain an authenticated
 *    context.
 * 2. Prepare a feature flag creation payload with realistic rollout settings and a
 *    coherent evaluation window (start_at < end_at). Explicitly set the
 *    optional todo_app_service_policy_id to null because the server binds
 *    policyId from the path.
 * 3. Use a clearly non-existent policyId (all-zero UUID) and attempt to create the
 *    flag.
 * 4. Validate that the creation call fails by asserting an error using
 *    TestValidator.error.
 *
 * Important notes:
 *
 * - Do not test specific HTTP status codes; only assert that an error occurs.
 * - Do not access or manipulate connection.headers; SDK handles auth
 *   automatically.
 */
export async function test_api_feature_flag_creation_under_nonexistent_policy_not_found(
  connection: api.IConnection,
) {
  // 1) Admin join (authentication setup)
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // >= 8 chars
  } satisfies ITodoAppSystemAdminJoin.ICreate;

  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: adminJoinBody,
  });
  typia.assert<ITodoAppSystemAdmin.IAuthorized>(admin);

  // 2) Use an obviously non-existent policyId
  const nonExistentPolicyId = typia.assert<string & tags.Format<"uuid">>(
    "00000000-0000-0000-0000-000000000000",
  );

  // 3) Prepare a realistic feature flag creation payload
  const now = new Date();
  const startAt = now.toISOString();
  const endAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString(); // +1 hour

  const createBody = {
    namespace: "ui",
    environment: RandomGenerator.pick(["dev", "staging", "prod"] as const),
    code: `flag_${RandomGenerator.alphaNumeric(8)}`,
    name: RandomGenerator.paragraph({ sentences: 2 }),
    description: RandomGenerator.paragraph({ sentences: 8 }),
    active: true,
    rollout_percentage: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
    >(),
    target_audience: RandomGenerator.paragraph({ sentences: 5 }),
    start_at: startAt,
    end_at: endAt,
    todo_app_service_policy_id: null,
  } satisfies ITodoAppFeatureFlag.ICreate;

  // 4) Attempt creation under the non-existent policy and expect failure
  await TestValidator.error(
    "creating feature flag under non-existent policy should fail",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
        connection,
        {
          policyId: nonExistentPolicyId,
          body: createBody,
        },
      );
    },
  );
}
