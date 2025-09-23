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
 * Update conflict on feature flag uniqueness within the same policy.
 *
 * Purpose:
 *
 * - Ensure that updating a feature flag (B) to a (namespace, code, environment)
 *   triplet already used by another feature flag (A) under the same policy
 *   results in a conflict error and does not mutate B.
 *
 * Steps:
 *
 * 1. Join as system administrator.
 * 2. Create a parent Service Policy.
 * 3. Create Feature Flag A under the policy with unique (namespace, code, env).
 * 4. Create Feature Flag B under the same policy with a different triplet.
 * 5. Attempt to update B so that (namespace, code, env) == A's triplet and expect
 *    an error (conflict) via TestValidator.error.
 * 6. Fetch B after the failed update and verify its triplet remains unchanged.
 */
export async function test_api_feature_flag_update_uniqueness_conflict_same_namespace_code_env(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, { body: joinBody });
  typia.assert(adminAuth);

  // 2) Create a parent Service Policy
  const policyBody = {
    namespace: `policy_${RandomGenerator.alphaNumeric(6)}`,
    code: `pol_${RandomGenerator.alphaNumeric(8)}`,
    name: `Policy ${RandomGenerator.name(2)}`,
    value: "enabled",
    value_type: "string",
    active: true,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: policyBody,
      },
    );
  typia.assert(policy);

  // 3) Create Feature Flag A with unique triplet
  const ENVIRONMENTS = ["dev", "staging", "prod"] as const;
  const envA = RandomGenerator.pick(ENVIRONMENTS);
  const nsA = `ns_${RandomGenerator.alphaNumeric(6)}`;
  const codeA = `A_${RandomGenerator.alphaNumeric(6)}`;
  const createA = {
    namespace: nsA,
    environment: envA,
    code: codeA,
    name: `Flag A ${RandomGenerator.name(2)}`,
    active: true,
    rollout_percentage: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
    >(),
  } satisfies ITodoAppFeatureFlag.ICreate;
  const flagA: ITodoAppFeatureFlag =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
      connection,
      { policyId: policy.id, body: createA },
    );
  typia.assert(flagA);

  // 4) Create Feature Flag B with a different triplet (same env & namespace, different code)
  const codeB = `B_${RandomGenerator.alphaNumeric(6)}`;
  const createB = {
    namespace: nsA,
    environment: envA,
    code: codeB,
    name: `Flag B ${RandomGenerator.name(2)}`,
    active: true,
    rollout_percentage: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
    >(),
  } satisfies ITodoAppFeatureFlag.ICreate;
  const flagB: ITodoAppFeatureFlag =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
      connection,
      { policyId: policy.id, body: createB },
    );
  typia.assert(flagB);

  // Capture B's original triplet for later verification
  const originalNamespaceB: string = flagB.namespace;
  const originalCodeB: string = flagB.code;
  const originalEnvB: string | null | undefined = flagB.environment;

  // 5) Attempt to update B to A's triplet -> expect error (conflict)
  // Preserve null explicitly when A.environment is null; otherwise use A.environment
  const envForConflict: string | null | undefined =
    flagA.environment === null ? null : flagA.environment;
  const conflictUpdateBody = {
    namespace: flagA.namespace,
    code: flagA.code,
    environment: envForConflict,
  } satisfies ITodoAppFeatureFlag.IUpdate;
  await TestValidator.error(
    "updating B to A's (namespace, code, environment) should fail with conflict",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.update(
        connection,
        {
          policyId: policy.id,
          featureFlagId: flagB.id,
          body: conflictUpdateBody,
        },
      );
    },
  );

  // 6) Fetch B after failed update and verify fields unchanged
  const readB: ITodoAppFeatureFlag =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.at(
      connection,
      { policyId: policy.id, featureFlagId: flagB.id },
    );
  typia.assert(readB);

  TestValidator.equals(
    "namespace of B remains unchanged after conflict",
    readB.namespace,
    originalNamespaceB,
  );
  TestValidator.equals(
    "code of B remains unchanged after conflict",
    readB.code,
    originalCodeB,
  );
  TestValidator.equals(
    "environment of B remains unchanged after conflict",
    readB.environment ?? null,
    originalEnvB ?? null,
  );
}
