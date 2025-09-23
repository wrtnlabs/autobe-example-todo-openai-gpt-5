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
 * Ensure cross-policy isolation when deleting a feature flag.
 *
 * This test verifies that attempting to DELETE a feature flag using a policyId
 * different from the flag's owning policy results in an error (not-found style)
 * and that the flag remains under its original policy afterwards.
 *
 * Steps:
 *
 * 1. Join as system administrator (auth token handled by SDK).
 * 2. Create two service policies: Policy A and Policy B (distinct codes).
 * 3. Create a feature flag under Policy A.
 * 4. Attempt to DELETE the feature flag using Policy B's policyId → expect error.
 * 5. GET the feature flag under Policy A and verify it still exists.
 */
export async function test_api_feature_flag_delete_cross_policy_mismatch_not_found(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: typia.random<ITodoAppSystemAdminJoin.ICreate>(),
  });
  typia.assert(admin);

  // 2) Create two service policies (A, B)
  const policyABody = {
    namespace: "flags",
    code: `pol_${RandomGenerator.alphaNumeric(12)}`,
    name: `Policy A ${RandomGenerator.name(1)}`,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    value: "true",
    value_type: "boolean",
    active: true,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policyA =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyABody },
    );
  typia.assert(policyA);

  const policyBBody = {
    namespace: "flags",
    code: `pol_${RandomGenerator.alphaNumeric(12)}`,
    name: `Policy B ${RandomGenerator.name(1)}`,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    value: "true",
    value_type: "boolean",
    active: true,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policyB =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBBody },
    );
  typia.assert(policyB);

  // 3) Create a feature flag under Policy A
  const createFlagBody = {
    namespace: "ui",
    environment: "dev",
    code: `feat_${RandomGenerator.alphaNumeric(12)}`,
    name: `Feature ${RandomGenerator.name(1)}`,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    active: true,
    rollout_percentage: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
    >(),
  } satisfies ITodoAppFeatureFlag.ICreate;
  const createdFlag =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
      connection,
      {
        policyId: policyA.id,
        body: createFlagBody,
      },
    );
  typia.assert(createdFlag);

  // 4) Try to delete with mismatched policy (Policy B) → expect error
  await TestValidator.error(
    "cross-policy DELETE must fail (not found style)",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.erase(
        connection,
        {
          policyId: policyB.id,
          featureFlagId: createdFlag.id,
        },
      );
    },
  );

  // 5) Verify the flag still exists under Policy A via GET
  const fetched =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.at(
      connection,
      {
        policyId: policyA.id,
        featureFlagId: createdFlag.id,
      },
    );
  typia.assert(fetched);
  TestValidator.equals(
    "fetched flag id should equal created flag id",
    fetched.id,
    createdFlag.id,
  );
}
