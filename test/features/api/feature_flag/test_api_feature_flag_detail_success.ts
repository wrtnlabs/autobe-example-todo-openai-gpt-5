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
 * Retrieve a feature flag detail under its owning policy.
 *
 * Business goal:
 *
 * - Ensure a system admin can authenticate, create a parent service policy,
 *   create a feature flag under that policy, and then retrieve the flag detail
 *   by (policyId, featureFlagId).
 *
 * Why necessary:
 *
 * - Validates end-to-end policy scoping enforcement and confirms the returned
 *   ITodoAppFeatureFlag matches what was created under the policy.
 *
 * Steps:
 *
 * 1. Admin join (authorization managed by SDK)
 * 2. Create service policy
 * 3. Create feature flag under that policy (policy-scoped)
 * 4. GET feature flag detail via policy + feature flag IDs
 * 5. Validate types and key field persistence and ownership linkage
 */
export async function test_api_feature_flag_detail_success(
  connection: api.IConnection,
) {
  // 1) Admin join
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: adminJoinBody,
    });
  typia.assert(admin);

  // 2) Create parent service policy
  const policyBody = {
    namespace: "feature",
    code: `pol_${RandomGenerator.alphaNumeric(12)}`,
    name: RandomGenerator.paragraph({ sentences: 2 }),
    description: RandomGenerator.paragraph({ sentences: 8 }),
    value: "true",
    value_type: "boolean",
    active: true,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBody },
    );
  typia.assert(policy);

  // 3) Create a feature flag under the policy
  const flagBody = {
    namespace: "ui",
    environment: "staging",
    code: `flag_${RandomGenerator.alphaNumeric(10)}`,
    name: RandomGenerator.paragraph({ sentences: 2 }),
    description: RandomGenerator.paragraph(),
    active: true,
    rollout_percentage: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
    >(),
    target_audience: RandomGenerator.paragraph({ sentences: 5 }),
    start_at: null,
    end_at: null,
  } satisfies ITodoAppFeatureFlag.ICreate;
  const created: ITodoAppFeatureFlag =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
      connection,
      { policyId: policy.id, body: flagBody },
    );
  typia.assert(created);

  // 4) Retrieve the feature flag detail
  const got: ITodoAppFeatureFlag =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.at(
      connection,
      { policyId: policy.id, featureFlagId: created.id },
    );
  typia.assert(got);

  // 5) Validate business linkage and persistence
  TestValidator.equals(
    "retrieved flag id equals created id",
    got.id,
    created.id,
  );
  TestValidator.equals(
    "retrieved flag policy linkage equals parent policy id",
    got.todo_app_service_policy_id,
    policy.id,
  );
  TestValidator.equals(
    "namespace persisted",
    got.namespace,
    flagBody.namespace,
  );
  TestValidator.equals("code persisted", got.code, flagBody.code);
  TestValidator.equals(
    "environment persisted",
    got.environment,
    flagBody.environment,
  );
  TestValidator.equals("active persisted", got.active, flagBody.active);
  TestValidator.equals(
    "rollout percentage persisted",
    got.rollout_percentage,
    flagBody.rollout_percentage,
  );
}
