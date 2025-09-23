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
 * Update conflict when duplicating (namespace, code, environment) tuple.
 *
 * Purpose:
 *
 * - Ensure the composite uniqueness constraint of Feature Flags on (namespace,
 *   code, environment) is enforced during updates.
 *
 * Steps:
 *
 * 1. Authenticate as system admin.
 * 2. Create a Service Policy (used to link flags realistically).
 * 3. Create Feature Flag A with tuple (namespace1, code1, env1).
 * 4. Create Feature Flag B with a different tuple (namespace2, code2, env2).
 * 5. Attempt to update B to match A's tuple and expect an error.
 */
export async function test_api_feature_flag_update_conflict_on_unique_tuple(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: joinBody,
  });
  typia.assert(admin);

  // 2) Create a Service Policy
  const policyBody = {
    namespace: "feature",
    code: `ff_policy_${RandomGenerator.alphaNumeric(8)}`,
    name: RandomGenerator.paragraph({ sentences: 2 }),
    description: RandomGenerator.paragraph({ sentences: 6 }),
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

  // 3) Create Feature Flag A
  const envs = ["prod", "staging", "dev"] as const;
  const nsA = `nsA_${RandomGenerator.alphaNumeric(6)}`;
  const codeA = `codeA_${RandomGenerator.alphaNumeric(6)}`;
  const envA = RandomGenerator.pick(envs);
  const flagABody = {
    namespace: nsA,
    environment: envA,
    code: codeA,
    name: `Feature Flag A ${RandomGenerator.name(1)}`,
    description: RandomGenerator.paragraph({ sentences: 8 }),
    active: true,
    rollout_percentage: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
    >(),
    target_audience: RandomGenerator.paragraph({ sentences: 4 }),
    start_at: undefined,
    end_at: undefined,
    todo_app_service_policy_id: policy.id,
  } satisfies ITodoAppFeatureFlag.ICreate;
  const flagA = await api.functional.todoApp.systemAdmin.featureFlags.create(
    connection,
    { body: flagABody },
  );
  typia.assert(flagA);

  // 4) Create Feature Flag B with different tuple
  const nsB = `nsB_${RandomGenerator.alphaNumeric(6)}`;
  const codeB = `codeB_${RandomGenerator.alphaNumeric(6)}`;
  const otherEnvs = envs.filter((e) => e !== envA);
  const envB = otherEnvs.length > 0 ? RandomGenerator.pick(otherEnvs) : envA;
  const flagBBody = {
    namespace: nsB,
    environment: envB,
    code: codeB,
    name: `Feature Flag B ${RandomGenerator.name(1)}`,
    description: RandomGenerator.paragraph({ sentences: 5 }),
    active: true,
    rollout_percentage: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
    >(),
    target_audience: RandomGenerator.paragraph({ sentences: 3 }),
    start_at: undefined,
    end_at: undefined,
    todo_app_service_policy_id: policy.id,
  } satisfies ITodoAppFeatureFlag.ICreate;
  const flagB = await api.functional.todoApp.systemAdmin.featureFlags.create(
    connection,
    { body: flagBBody },
  );
  typia.assert(flagB);

  // Sanity: ensure A and B tuples are different initially
  const tupleA = `${flagA.namespace}::${flagA.code}::${flagA.environment ?? ""}`;
  const tupleB = `${flagB.namespace}::${flagB.code}::${flagB.environment ?? ""}`;
  TestValidator.notEquals(
    "initial tuples of A and B must differ",
    tupleA,
    tupleB,
  );

  // 5) Attempt to update B to match A's tuple → expect conflict
  await TestValidator.error(
    "updating B to duplicate (namespace, code, environment) should fail",
    async () => {
      await api.functional.todoApp.systemAdmin.featureFlags.update(connection, {
        featureFlagId: flagB.id,
        body: {
          namespace: flagA.namespace,
          code: flagA.code,
          environment: flagA.environment ?? null,
        } satisfies ITodoAppFeatureFlag.IUpdate,
      });
    },
  );
}
