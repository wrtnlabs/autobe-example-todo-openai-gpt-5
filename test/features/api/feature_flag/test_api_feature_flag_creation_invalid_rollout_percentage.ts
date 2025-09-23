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
 * Validate numeric bounds on rollout_percentage when creating a feature flag.
 *
 * Business context:
 *
 * - Feature flags are created under a service policy scope and must be managed by
 *   a system admin. The rollout_percentage must be an int32 within 0–100
 *   (inclusive).
 *
 * Steps:
 *
 * 1. Join as system admin (auth token attached by SDK).
 * 2. Create a parent service policy (required by scoped endpoint).
 * 3. Attempt to create a feature flag with rollout_percentage = -1 (expect error).
 * 4. Attempt to create a feature flag with rollout_percentage = 150 (expect
 *    error).
 * 5. Create a feature flag with rollout_percentage = 100 (boundary valid) and
 *    verify that it is bound to the given policy.
 */
export async function test_api_feature_flag_creation_invalid_rollout_percentage(
  connection: api.IConnection,
) {
  // 1) Admin join (authentication)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, { body: joinBody });
  typia.assert(admin);

  // 2) Create parent policy required by the scoped endpoint
  const policyBody = {
    namespace: "feature-governance",
    code: `pol-${RandomGenerator.alphaNumeric(12)}`,
    name: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.paragraph({ sentences: 6 }),
    value: "on",
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

  // Helper to build a base-valid feature flag body with custom rollout percentage
  const buildFlagBody = (rollout: number) =>
    ({
      namespace: "ui",
      environment: "dev",
      code: `flag-${RandomGenerator.alphaNumeric(10)}`,
      name: RandomGenerator.paragraph({ sentences: 2 }),
      description: RandomGenerator.paragraph({ sentences: 5 }),
      active: true,
      rollout_percentage: rollout,
      target_audience: RandomGenerator.paragraph({ sentences: 4 }),
    }) satisfies ITodoAppFeatureFlag.ICreate;

  // 3) Below-minimum rollout should be rejected
  await TestValidator.error(
    "feature flag creation fails when rollout_percentage < 0",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
        connection,
        {
          policyId: policy.id,
          body: buildFlagBody(-1),
        },
      );
    },
  );

  // 4) Above-maximum rollout should be rejected
  await TestValidator.error(
    "feature flag creation fails when rollout_percentage > 100",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
        connection,
        {
          policyId: policy.id,
          body: buildFlagBody(150),
        },
      );
    },
  );

  // 5) Boundary-valid rollout (100) should succeed
  const validFlag: ITodoAppFeatureFlag =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
      connection,
      {
        policyId: policy.id,
        body: buildFlagBody(100),
      },
    );
  typia.assert(validFlag);

  // Verify policy binding and the applied rollout percentage
  TestValidator.equals(
    "created flag binds to provided policyId",
    validFlag.todo_app_service_policy_id,
    policy.id,
  );
  TestValidator.equals(
    "created flag stores the requested rollout percentage",
    validFlag.rollout_percentage,
    100,
  );
}
