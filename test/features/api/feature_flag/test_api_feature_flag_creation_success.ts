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
 * Create a valid feature flag under a policy and verify persistence via detail
 * retrieval.
 *
 * Steps:
 *
 * 1. Admin joins to obtain authorization (systemAdmin).
 * 2. Admin creates a service policy (parent container for flags).
 * 3. Admin creates a feature flag under the policy with valid fields and rollout
 *    0–100.
 * 4. Admin retrieves the created feature flag by (policyId, featureFlagId) and
 *    compares persisted values.
 *
 * Validations:
 *
 * - Server binds the flag to the path policyId (todo_app_service_policy_id ==
 *   policy.id).
 * - Created and fetched flags share the same id.
 * - Core fields (namespace, code, environment, name, active, rollout_percentage,
 *   and optionals) match input.
 */
export async function test_api_feature_flag_creation_success(
  connection: api.IConnection,
) {
  // 1) Admin join
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, { body: joinBody });
  typia.assert(admin);

  // 2) Create service policy (parent)
  const now = new Date();
  const start = new Date(now.getTime() + 1_000); // +1s to avoid past
  const end = new Date(start.getTime() + 60_000); // +60s after start
  const policyCreateBody = {
    namespace: `pol-${RandomGenerator.alphaNumeric(6)}`,
    code: `code-${RandomGenerator.alphaNumeric(8)}`,
    name: `name-${RandomGenerator.alphaNumeric(6)}`,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    value: RandomGenerator.paragraph({ sentences: 4 }),
    value_type: "string",
    active: true,
    effective_from: start.toISOString(),
    effective_to: end.toISOString(),
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: policyCreateBody,
      },
    );
  typia.assert(policy);

  // 3) Create feature flag under the created policy
  const ENVIRONMENTS = ["prod", "staging", "dev"] as const;
  const environment = RandomGenerator.pick(ENVIRONMENTS);
  const flagStart = new Date(end.getTime() + 1_000);
  const flagEnd = new Date(flagStart.getTime() + 120_000);
  const rollout = typia.random<
    number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
  >();
  const flagCreateBody = {
    namespace: `flag-${RandomGenerator.alphaNumeric(5)}`,
    environment,
    code: `feat-${RandomGenerator.alphaNumeric(8)}`,
    name: `Feature ${RandomGenerator.alphaNumeric(6)}`,
    description: RandomGenerator.paragraph({ sentences: 5 }),
    active: true,
    rollout_percentage: rollout,
    target_audience: RandomGenerator.paragraph({ sentences: 5 }),
    start_at: flagStart.toISOString(),
    end_at: flagEnd.toISOString(),
    // Intentionally omit todo_app_service_policy_id: server binds from path
  } satisfies ITodoAppFeatureFlag.ICreate;
  const created: ITodoAppFeatureFlag =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
      connection,
      {
        policyId: policy.id,
        body: flagCreateBody,
      },
    );
  typia.assert(created);

  // Strengthen binding assertion immediately after creation
  TestValidator.equals(
    "created flag bound to parent policy via path",
    created.todo_app_service_policy_id,
    policy.id,
  );

  // 4) Retrieve the created feature flag and validate
  const fetched: ITodoAppFeatureFlag =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.at(
      connection,
      {
        policyId: policy.id,
        featureFlagId: created.id,
      },
    );
  typia.assert(fetched);

  // Equality checks
  TestValidator.equals("fetched id equals created id", fetched.id, created.id);
  TestValidator.equals(
    "fetched flag bound to parent policy via path",
    fetched.todo_app_service_policy_id,
    policy.id,
  );

  // Core property persistence checks
  TestValidator.equals(
    "namespace persisted",
    fetched.namespace,
    flagCreateBody.namespace,
  );
  TestValidator.equals(
    "environment persisted",
    fetched.environment,
    flagCreateBody.environment,
  );
  TestValidator.equals("code persisted", fetched.code, flagCreateBody.code);
  TestValidator.equals("name persisted", fetched.name, flagCreateBody.name);
  TestValidator.equals(
    "active flag persisted",
    fetched.active,
    flagCreateBody.active,
  );
  TestValidator.equals(
    "rollout_percentage persisted",
    fetched.rollout_percentage,
    flagCreateBody.rollout_percentage,
  );
  TestValidator.equals(
    "description persisted",
    fetched.description,
    flagCreateBody.description,
  );
  TestValidator.equals(
    "target_audience persisted",
    fetched.target_audience,
    flagCreateBody.target_audience,
  );
  TestValidator.equals(
    "start_at persisted",
    fetched.start_at,
    flagCreateBody.start_at,
  );
  TestValidator.equals(
    "end_at persisted",
    fetched.end_at,
    flagCreateBody.end_at,
  );

  // Informational business sanity check on rollout boundaries
  TestValidator.predicate(
    "rollout percentage within 0..100",
    fetched.rollout_percentage >= 0 && fetched.rollout_percentage <= 100,
  );
}
