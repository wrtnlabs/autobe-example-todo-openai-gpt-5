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
 * Validate uniqueness enforcement for Feature Flag creation.
 *
 * Business context: Feature flags are uniquely identified by the triple
 * (namespace, code, environment). This test ensures that creating a duplicate
 * flag with the same triple results in a business error while using correct
 * DTOs and valid data.
 *
 * Steps:
 *
 * 1. Authenticate as systemAdmin via join.
 * 2. Create a Service Policy for realistic linkage.
 * 3. Create the first Feature Flag with a unique (namespace, code, environment).
 * 4. Attempt to create a second Feature Flag with the identical triple → expect
 *    error.
 */
export async function test_api_feature_flag_creation_uniqueness_violation(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin (token handled by SDK automatically)
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const authorized = await api.functional.auth.systemAdmin.join(connection, {
    body: adminJoinBody,
  });
  typia.assert(authorized);

  // 2) Create a Service Policy to link the feature flag
  const policyBody = {
    namespace: RandomGenerator.pick([
      "auth",
      "security",
      "feature",
      "flags",
    ] as const),
    code: `policy_${RandomGenerator.alphaNumeric(8)}`,
    name: `Policy ${RandomGenerator.name(2)}`,
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

  // 3) Prepare triple (namespace, code, environment) and create the first Feature Flag
  const namespace = RandomGenerator.pick([
    "ui",
    "payments",
    "sync",
    "core",
  ] as const);
  const environment = RandomGenerator.pick(["dev", "staging", "prod"] as const);
  const code = `flag_${RandomGenerator.alphaNumeric(10)}`;

  const flagCreateBody = {
    namespace,
    environment,
    code,
    name: `Feature ${RandomGenerator.name(2)}`,
    description: RandomGenerator.paragraph({ sentences: 8 }),
    active: true,
    rollout_percentage: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
    >(),
    target_audience: RandomGenerator.paragraph({ sentences: 5 }),
    todo_app_service_policy_id: policy.id,
  } satisfies ITodoAppFeatureFlag.ICreate;
  const created = await api.functional.todoApp.systemAdmin.featureFlags.create(
    connection,
    { body: flagCreateBody },
  );
  typia.assert(created);

  // Echo validations for business-critical fields
  TestValidator.equals(
    "created flag.namespace equals request",
    created.namespace,
    namespace,
  );
  TestValidator.equals("created flag.code equals request", created.code, code);
  TestValidator.equals(
    "created flag.environment equals request",
    created.environment,
    environment,
  );
  TestValidator.equals(
    "created flag.active equals request",
    created.active,
    flagCreateBody.active,
  );
  TestValidator.equals(
    "created flag.rollout_percentage equals request",
    created.rollout_percentage,
    flagCreateBody.rollout_percentage,
  );

  // 4) Attempt to create a duplicate Feature Flag with identical triple
  const duplicateBody = {
    namespace,
    environment,
    code,
    name: `Duplicate ${RandomGenerator.name(2)}`,
    description: RandomGenerator.paragraph({ sentences: 4 }),
    active: true,
    rollout_percentage: flagCreateBody.rollout_percentage,
    target_audience: RandomGenerator.paragraph({ sentences: 3 }),
    todo_app_service_policy_id: policy.id,
  } satisfies ITodoAppFeatureFlag.ICreate;

  await TestValidator.error(
    "duplicate (namespace, code, environment) should be rejected",
    async () => {
      await api.functional.todoApp.systemAdmin.featureFlags.create(connection, {
        body: duplicateBody,
      });
    },
  );
}
