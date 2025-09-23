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
 * Validate rejection of out-of-range rollout_percentage updates and
 * immutability on failure.
 *
 * Workflow:
 *
 * 1. Register and authenticate as a system administrator (token handled by SDK).
 * 2. Create a Service Policy (parent scope for feature flags).
 * 3. Create a Feature Flag with a valid rollout_percentage in [0, 100].
 * 4. Attempt to update the Feature Flag with invalid rollout_percentage values
 *    (-10 and 150) and expect errors.
 * 5. Read back the Feature Flag and verify it remains unchanged (id, policy
 *    linkage, rollout_percentage, code, active, updated_at).
 */
export async function test_api_feature_flag_update_invalid_rollout_percentage_out_of_range(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(adminAuth);

  // 2) Create parent Service Policy
  const policy: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: {
          namespace: "feature-governance",
          code: `pol_${RandomGenerator.alphaNumeric(10)}`,
          name: RandomGenerator.paragraph({ sentences: 3 }),
          description: RandomGenerator.paragraph({ sentences: 8 }),
          value: "on",
          value_type: "string",
          active: true,
        } satisfies ITodoAppServicePolicy.ICreate,
      },
    );
  typia.assert(policy);

  // 3) Create a Feature Flag with a valid rollout percentage
  const validRollout = typia.random<
    number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
  >();
  const createdFlag: ITodoAppFeatureFlag =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
      connection,
      {
        policyId: policy.id,
        body: {
          namespace: "ui",
          environment: "dev",
          code: `ff_${RandomGenerator.alphaNumeric(10)}`,
          name: RandomGenerator.paragraph({ sentences: 3 }),
          description: RandomGenerator.paragraph({ sentences: 8 }),
          active: true,
          rollout_percentage: validRollout,
        } satisfies ITodoAppFeatureFlag.ICreate,
      },
    );
  typia.assert(createdFlag);

  // 4) Attempt invalid updates (expect errors) - negative value
  await TestValidator.error(
    "reject negative rollout percentage (-10)",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.update(
        connection,
        {
          policyId: policy.id,
          featureFlagId: createdFlag.id,
          body: {
            rollout_percentage: -10,
          } satisfies ITodoAppFeatureFlag.IUpdate,
        },
      );
    },
  );

  // 4-2) Attempt invalid updates (expect errors) - greater than 100
  await TestValidator.error(
    "reject rollout percentage > 100 (150)",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.update(
        connection,
        {
          policyId: policy.id,
          featureFlagId: createdFlag.id,
          body: {
            rollout_percentage: 150,
          } satisfies ITodoAppFeatureFlag.IUpdate,
        },
      );
    },
  );

  // 5) Read back and verify no changes occurred
  const fresh: ITodoAppFeatureFlag =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.at(
      connection,
      {
        policyId: policy.id,
        featureFlagId: createdFlag.id,
      },
    );
  typia.assert(fresh);

  // Entity identity unchanged
  TestValidator.equals(
    "id remains unchanged after failed updates",
    fresh.id,
    createdFlag.id,
  );
  // Policy linkage unchanged (server binds to path policy)
  TestValidator.equals(
    "policy linkage remains unchanged",
    fresh.todo_app_service_policy_id,
    createdFlag.todo_app_service_policy_id,
  );
  // rollout_percentage unchanged
  TestValidator.equals(
    "rollout_percentage remains unchanged",
    fresh.rollout_percentage,
    createdFlag.rollout_percentage,
  );
  // Stable fields unchanged
  TestValidator.equals("code remains unchanged", fresh.code, createdFlag.code);
  TestValidator.equals(
    "active remains unchanged",
    fresh.active,
    createdFlag.active,
  );
  // No update timestamp change on failed validations
  TestValidator.equals(
    "updated_at remains unchanged on failed updates",
    fresh.updated_at,
    createdFlag.updated_at,
  );
}
