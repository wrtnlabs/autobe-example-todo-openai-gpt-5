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
 * Verify systemAdmin can retrieve a specific Feature Flag by ID and see full
 * details.
 *
 * Flow:
 *
 * 1. SystemAdmin join (authentication token handled by SDK)
 * 2. Create a Service Policy (to be linked to the flag)
 * 3. Create a Feature Flag linked to the policy, with explicit start/end windows
 * 4. Retrieve the Feature Flag by ID
 * 5. Validate entity integrity and business fields, including policy linkage and
 *    no soft-delete
 */
export async function test_api_feature_flag_detail_success_existing(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12), // within MinLength<8> & MaxLength<64>
      // ip / user_agent are optional; omit for simplicity
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 2) Create a Service Policy
  const policyBody = {
    namespace: `policy_${RandomGenerator.alphabets(6)}`,
    code: `code_${RandomGenerator.alphaNumeric(10)}`,
    name: RandomGenerator.paragraph({ sentences: 2 }),
    description: RandomGenerator.paragraph({ sentences: 5 }),
    value: "on",
    value_type: "string",
    active: true,
    // effective_from/to optional; omit for now
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBody },
    );
  typia.assert(policy);

  // Prepare deterministic time window for the flag
  const now = new Date();
  const startAt = now.toISOString();
  const endAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString(); // +1 hour

  // 3) Create a Feature Flag linked to the policy
  const flagBody = {
    namespace: `ns_${RandomGenerator.alphabets(5)}`,
    environment: RandomGenerator.pick(["prod", "staging", "dev"] as const),
    code: `flag_${RandomGenerator.alphaNumeric(12)}`,
    name: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.paragraph({ sentences: 6 }),
    active: true,
    rollout_percentage: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
    >(),
    target_audience: RandomGenerator.paragraph({ sentences: 4 }),
    start_at: startAt,
    end_at: endAt,
    todo_app_service_policy_id: policy.id,
  } satisfies ITodoAppFeatureFlag.ICreate;
  const created = await api.functional.todoApp.systemAdmin.featureFlags.create(
    connection,
    { body: flagBody },
  );
  typia.assert(created);

  // 4) Retrieve by ID
  const read = await api.functional.todoApp.systemAdmin.featureFlags.at(
    connection,
    { featureFlagId: created.id },
  );
  typia.assert(read);

  // 5) Business validations
  TestValidator.equals("detail: id matches created", read.id, created.id);
  TestValidator.equals(
    "detail: namespace matches",
    read.namespace,
    created.namespace,
  );
  TestValidator.equals(
    "detail: environment matches",
    read.environment,
    created.environment,
  );
  TestValidator.equals("detail: code matches", read.code, created.code);
  TestValidator.equals("detail: name matches", read.name, created.name);
  TestValidator.equals("detail: active matches", read.active, created.active);
  TestValidator.equals(
    "detail: rollout_percentage matches",
    read.rollout_percentage,
    created.rollout_percentage,
  );
  TestValidator.equals(
    "detail: target_audience matches",
    read.target_audience,
    created.target_audience,
  );
  TestValidator.equals("detail: start_at matches", read.start_at, startAt);
  TestValidator.equals("detail: end_at matches", read.end_at, endAt);
  TestValidator.equals(
    "detail: policy linkage id matches",
    read.todo_app_service_policy_id,
    policy.id,
  );

  // Soft deletion should not be set for a freshly created entity
  TestValidator.predicate(
    "detail: deleted_at should be nullish",
    read.deleted_at === null || read.deleted_at === undefined,
  );
}
