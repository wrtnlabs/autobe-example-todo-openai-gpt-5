import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppFeatureFlag } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppFeatureFlag";
import type { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

export async function test_api_feature_flag_update_toggle_active_and_rollout(
  connection: api.IConnection,
) {
  /**
   * Validate updating a Feature Flag to toggle active and adjust
   * rollout_percentage.
   *
   * Steps:
   *
   * 1. Join as system admin.
   * 2. Create a service policy to associate with the feature flag.
   * 3. Create an initial feature flag (active=false, rollout_percentage=0).
   * 4. Update the flag (active=true, rollout_percentage=50).
   *
   * Assertions:
   *
   * - Response typing via typia.assert on all non-void responses.
   * - Id remains the same after update.
   * - Created_at remains the same; updated_at is refreshed (differs).
   * - Active becomes true; rollout_percentage becomes 50.
   * - Policy association remains intact.
   */
  // 1) Authenticate as systemAdmin
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 2) Create a Service Policy
  const policyBody = {
    namespace: "feature",
    code: `ff_policy_${RandomGenerator.alphaNumeric(12)}`,
    name: RandomGenerator.name(2),
    description: RandomGenerator.paragraph({ sentences: 8 }),
    value: "on",
    value_type: "string",
    active: true,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBody },
    );
  typia.assert(policy);

  // 3) Create a Feature Flag (inactive with 0% rollout)
  const createFlagBody = {
    namespace: "ui",
    environment: "staging",
    code: `flag_${RandomGenerator.alphaNumeric(16)}`,
    name: RandomGenerator.name(2),
    description: RandomGenerator.paragraph({ sentences: 6 }),
    active: false,
    rollout_percentage: 0,
    target_audience: null,
    start_at: null,
    end_at: null,
    todo_app_service_policy_id: policy.id,
  } satisfies ITodoAppFeatureFlag.ICreate;
  const flag = await api.functional.todoApp.systemAdmin.featureFlags.create(
    connection,
    { body: createFlagBody },
  );
  typia.assert(flag);

  // 4) Update the Feature Flag: toggle active and set rollout to 50
  const updated = await api.functional.todoApp.systemAdmin.featureFlags.update(
    connection,
    {
      featureFlagId: flag.id,
      body: {
        active: true,
        rollout_percentage: 50,
      } satisfies ITodoAppFeatureFlag.IUpdate,
    },
  );
  typia.assert(updated);

  // Validations
  TestValidator.equals(
    "feature flag id remains the same after update",
    updated.id,
    flag.id,
  );
  TestValidator.equals("active toggled to true", updated.active, true);
  TestValidator.equals(
    "rollout_percentage updated to 50",
    updated.rollout_percentage,
    50,
  );
  TestValidator.equals(
    "created_at unchanged after update",
    updated.created_at,
    flag.created_at,
  );
  TestValidator.notEquals(
    "updated_at refreshed after update",
    updated.updated_at,
    flag.updated_at,
  );
  TestValidator.equals(
    "policy association remains intact",
    updated.todo_app_service_policy_id,
    flag.todo_app_service_policy_id,
  );
}
