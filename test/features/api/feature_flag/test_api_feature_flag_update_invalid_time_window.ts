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
 * Update with invalid time window must fail for feature flags.
 *
 * Steps:
 *
 * 1. Join as systemAdmin (auth token handled by SDK).
 * 2. Create a Service Policy for linkage.
 * 3. Create a Feature Flag with a valid start/end window and link the policy.
 * 4. Try updating the flag with end_at earlier than start_at and expect an error.
 *
 * Notes:
 *
 * - All request bodies use const + `satisfies` with exact DTOs.
 * - All responses validated by typia.assert().
 * - No status code assertions; only business error expectation via
 *   TestValidator.error.
 */
export async function test_api_feature_flag_update_invalid_time_window(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, { body: joinBody });
  typia.assert(admin);

  // 2) Create a Service Policy
  const policyBody = {
    namespace: "flags",
    code: `pol_${RandomGenerator.alphaNumeric(10)}`,
    name: `Policy ${RandomGenerator.name(2)}`,
    value: "on",
    value_type: "string",
    active: true,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBody },
    );
  typia.assert(policy);

  // 3) Create a Feature Flag (valid initial window)
  const now = new Date();
  const startAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString(); // +1h
  const endAt = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(); // +2h

  const flagCreateBody = {
    namespace: "ui",
    environment: "staging",
    code: `ff_${RandomGenerator.alphaNumeric(10)}`,
    name: `Flag ${RandomGenerator.name(2)}`,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    active: true,
    rollout_percentage: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
    >(),
    target_audience: RandomGenerator.paragraph({ sentences: 8 }),
    start_at: startAt,
    end_at: endAt,
    todo_app_service_policy_id: policy.id,
  } satisfies ITodoAppFeatureFlag.ICreate;
  const featureFlag: ITodoAppFeatureFlag =
    await api.functional.todoApp.systemAdmin.featureFlags.create(connection, {
      body: flagCreateBody,
    });
  typia.assert(featureFlag);

  // Linkage check to confirm realistic creation
  TestValidator.equals(
    "feature flag should link to created policy",
    featureFlag.todo_app_service_policy_id,
    policy.id,
  );

  // 4) Attempt invalid update: end_at before start_at
  const invalidStartAt = new Date(
    now.getTime() + 3 * 60 * 60 * 1000,
  ).toISOString(); // +3h
  const invalidEndAt = new Date(
    now.getTime() + 2 * 60 * 60 * 1000,
  ).toISOString(); // +2h

  const updateBody = {
    start_at: invalidStartAt,
    end_at: invalidEndAt,
  } satisfies ITodoAppFeatureFlag.IUpdate;

  await TestValidator.error(
    "updating with end_at earlier than start_at must fail",
    async () => {
      await api.functional.todoApp.systemAdmin.featureFlags.update(connection, {
        featureFlagId: featureFlag.id,
        body: updateBody,
      });
    },
  );
}
