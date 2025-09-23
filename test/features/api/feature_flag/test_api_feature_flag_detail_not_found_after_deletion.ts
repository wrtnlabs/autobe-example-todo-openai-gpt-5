import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppFeatureFlag } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppFeatureFlag";
import type { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Ensure soft-deleted feature flag is not retrievable via detail endpoint.
 *
 * Business context: System administrators manage feature flags. When a flag is
 * soft-deleted, it must not be available through standard detail reads. This
 * test validates that behavior end-to-end.
 *
 * Steps:
 *
 * 1. Join as systemAdmin (authorization token handled by SDK).
 * 2. Create a Service Policy to associate with the feature flag.
 * 3. Create a Feature Flag linked to the created policy.
 * 4. Soft-delete the Feature Flag.
 * 5. Attempt to fetch the Feature Flag; expect an error due to soft-deletion.
 */
export async function test_api_feature_flag_detail_not_found_after_deletion(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // length 12 satisfies 8<=len<=64
    ip: typia.random<string & tags.Format<"ipv4">>(),
    user_agent: RandomGenerator.paragraph({ sentences: 3 }),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const adminAuthorized: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: adminJoinBody,
    });
  typia.assert(adminAuthorized);

  // 2) Create a Service Policy
  const policyBody = {
    namespace: "feature",
    code: `policy-${RandomGenerator.alphaNumeric(12)}`,
    name: `Policy ${RandomGenerator.name(2)}`,
    description: RandomGenerator.paragraph({ sentences: 5 }),
    value: JSON.stringify({ rollout_default: 50 }),
    value_type: "string",
    active: true,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBody },
    );
  typia.assert(policy);

  // 3) Create a Feature Flag linked to the policy
  const environments = ["dev", "staging", "prod"] as const;
  const featureBody = {
    namespace: "ui",
    environment: RandomGenerator.pick(environments),
    code: `flag-${RandomGenerator.alphaNumeric(10)}`,
    name: `Flag ${RandomGenerator.name(1)}`,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    active: true,
    rollout_percentage: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
    >(),
    target_audience: RandomGenerator.paragraph({ sentences: 4 }),
    start_at: new Date().toISOString(),
    end_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    todo_app_service_policy_id: policy.id,
  } satisfies ITodoAppFeatureFlag.ICreate;
  const flag: ITodoAppFeatureFlag =
    await api.functional.todoApp.systemAdmin.featureFlags.create(connection, {
      body: featureBody,
    });
  typia.assert(flag);

  // Validate linkage
  TestValidator.equals(
    "created flag is linked to the created policy",
    flag.todo_app_service_policy_id,
    policy.id,
  );

  // 4) Soft-delete the Feature Flag (void response)
  await api.functional.todoApp.systemAdmin.featureFlags.erase(connection, {
    featureFlagId: flag.id,
  });

  // 5) Verify detail read fails after deletion
  await TestValidator.error(
    "deleted feature flag cannot be fetched",
    async () => {
      await api.functional.todoApp.systemAdmin.featureFlags.at(connection, {
        featureFlagId: flag.id,
      });
    },
  );
}
