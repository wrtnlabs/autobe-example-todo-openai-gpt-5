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
 * Enforce uniqueness of feature flags within a policy.
 *
 * Business objective:
 *
 * - A feature flag must be unique by the tuple (namespace, code, environment)
 *   under the same service policy.
 *
 * Test flow:
 *
 * 1. Join as systemAdmin (auth context).
 * 2. Create a service policy (parent scope for flags).
 * 3. Create a feature flag with specific (namespace, code, environment).
 * 4. Attempt to create another feature flag with the same tuple under the same
 *    policy and expect an error indicating uniqueness conflict (business
 *    error).
 *
 * Validations:
 *
 * - First creation returns ITodoAppFeatureFlag; fields match input; when present,
 *   todo_app_service_policy_id matches the policy id.
 * - Second creation fails; we only check an error occurs (no status code checks).
 */
export async function test_api_feature_flag_creation_uniqueness_conflict(
  connection: api.IConnection,
) {
  // 1) Join as systemAdmin
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(admin);

  // 2) Create a service policy
  const policyBody = {
    namespace: `policy_${RandomGenerator.alphaNumeric(6)}`,
    code: `code_${RandomGenerator.alphaNumeric(8)}`,
    name: RandomGenerator.paragraph({ sentences: 2 }),
    description: RandomGenerator.paragraph({ sentences: 6 }),
    value: RandomGenerator.paragraph({ sentences: 4 }),
    value_type: "string",
    active: true,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBody },
    );
  typia.assert(policy);

  // 3) Create first feature flag with (namespace, code, environment)
  const envOptions = ["dev", "staging", "prod"] as const;
  const environment: string = RandomGenerator.pick(envOptions);
  const flagBody = {
    namespace: `ui_${RandomGenerator.alphaNumeric(4)}`,
    code: `flag_${RandomGenerator.alphaNumeric(6)}`,
    environment,
    name: RandomGenerator.paragraph({ sentences: 2 }),
    description: RandomGenerator.paragraph({ sentences: 5 }),
    active: true,
    rollout_percentage: 50,
    target_audience: RandomGenerator.paragraph({ sentences: 4 }),
  } satisfies ITodoAppFeatureFlag.ICreate;
  const created: ITodoAppFeatureFlag =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
      connection,
      { policyId: policy.id, body: flagBody },
    );
  typia.assert(created);

  // Basic business validations on created entity
  TestValidator.equals(
    "created flag namespace should match input",
    created.namespace,
    flagBody.namespace,
  );
  TestValidator.equals(
    "created flag code should match input",
    created.code,
    flagBody.code,
  );
  TestValidator.equals(
    "created flag environment should match input",
    created.environment,
    environment,
  );
  // When server exposes the FK, ensure it matches the path policy id
  if (
    created.todo_app_service_policy_id !== null &&
    created.todo_app_service_policy_id !== undefined
  ) {
    TestValidator.equals(
      "created flag is bound to the parent policy",
      created.todo_app_service_policy_id,
      policy.id,
    );
  }

  // 4) Attempt to create duplicate with same (namespace, code, environment)
  await TestValidator.error(
    "duplicate feature flag (same namespace, code, environment) must fail",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
        connection,
        { policyId: policy.id, body: flagBody },
      );
    },
  );
}
