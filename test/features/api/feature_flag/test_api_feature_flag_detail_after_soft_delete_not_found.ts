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
 * Ensure feature flag detail is not retrievable after soft delete.
 *
 * Workflow:
 *
 * 1. Admin joins to acquire authentication (systemAdmin).
 * 2. Create a parent service policy.
 * 3. Create a feature flag under the created policy.
 * 4. (Baseline) Read the feature flag detail before deletion to confirm existence.
 * 5. Soft-delete the feature flag.
 * 6. Try to get the same feature flag detail and expect an error (not found).
 *
 * Notes:
 *
 * - Use proper DTO variants for request bodies (ICreate) and typia.assert on
 *   non-void responses.
 * - Do not inspect HTTP status codes; only verify that an error is thrown after
 *   deletion.
 */
export async function test_api_feature_flag_detail_after_soft_delete_not_found(
  connection: api.IConnection,
) {
  // 1) systemAdmin join (auth)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: joinBody,
  });
  typia.assert(admin);

  // 2) Create a service policy
  const policyBody = {
    namespace: "features",
    code: `pol-${RandomGenerator.alphaNumeric(10)}`,
    name: RandomGenerator.name(2),
    value: "true",
    value_type: "boolean",
    active: true,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBody },
    );
  typia.assert(policy);

  // 3) Create a feature flag under the policy
  const flagBody = {
    namespace: "ui",
    code: `flag-${RandomGenerator.alphaNumeric(8)}`,
    name: RandomGenerator.name(2),
    active: true,
    rollout_percentage: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
    >(),
  } satisfies ITodoAppFeatureFlag.ICreate;
  const flag =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
      connection,
      { policyId: policy.id, body: flagBody },
    );
  typia.assert(flag);

  // 4) Baseline read: confirm the flag is retrievable before deletion
  const before =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.at(
      connection,
      { policyId: policy.id, featureFlagId: flag.id },
    );
  typia.assert(before);
  TestValidator.equals(
    "baseline: retrieved flag id matches created flag id",
    before.id,
    flag.id,
  );

  // 5) Soft-delete the feature flag
  await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.erase(
    connection,
    { policyId: policy.id, featureFlagId: flag.id },
  );

  // 6) Verify detail retrieval fails after soft-delete
  await TestValidator.error(
    "feature flag detail should not be retrievable after soft delete",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.at(
        connection,
        { policyId: policy.id, featureFlagId: flag.id },
      );
    },
  );
}
