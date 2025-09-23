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
 * Cross-policy feature flag read must return not-found.
 *
 * Business context:
 *
 * - Feature flags are governed by service policies. Reading a flag requires
 *   specifying the correct parent policy in the path.
 * - Attempting to read a flag with a different policy must behave as not-found to
 *   prevent existence leakage across policy boundaries.
 *
 * Steps:
 *
 * 1. Admin join to obtain authorized context
 * 2. Create Policy A
 * 3. Create Policy B
 * 4. Create a feature flag under Policy A
 * 5. Verify normal read: GET the flag with Policy A → success
 * 6. Cross-policy negative: GET the same flag with Policy B → expect error
 */
export async function test_api_feature_flag_detail_cross_policy_not_found(
  connection: api.IConnection,
) {
  // 1) Admin join
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // Small unique suffix for codes/names
  const suffix: string = RandomGenerator.alphaNumeric(8);

  // 2) Create Policy A
  const policyABody = {
    namespace: "feature",
    code: `pol-${suffix}-A`,
    name: `Policy A ${suffix}`,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    value: "true",
    value_type: "boolean",
    active: true,
    effective_from: null,
    effective_to: null,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policyA =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyABody },
    );
  typia.assert(policyA);

  // 3) Create Policy B
  const policyBBody = {
    namespace: "feature",
    code: `pol-${suffix}-B`,
    name: `Policy B ${suffix}`,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    value: "false",
    value_type: "boolean",
    active: true,
    effective_from: null,
    effective_to: null,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policyB =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBBody },
    );
  typia.assert(policyB);

  // 4) Create a feature flag under Policy A
  const flagBody = {
    namespace: "ui",
    environment: "dev",
    code: `flag-${suffix}`,
    name: `Flag ${suffix}`,
    description: RandomGenerator.paragraph({ sentences: 8 }),
    active: true,
    rollout_percentage: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
    >(),
    // omit target_audience/start_at/end_at to keep scenario minimal
  } satisfies ITodoAppFeatureFlag.ICreate;
  const created =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
      connection,
      {
        policyId: policyA.id,
        body: flagBody,
      },
    );
  typia.assert(created);

  // 5) Normal read with correct policy path
  const fetched =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.at(
      connection,
      {
        policyId: policyA.id,
        featureFlagId: created.id,
      },
    );
  typia.assert(fetched);
  TestValidator.equals(
    "feature flag id should match when fetched under correct policy",
    fetched.id,
    created.id,
  );

  // 6) Cross-policy read must fail (do not test specific HTTP status codes)
  await TestValidator.error(
    "cross-policy read must be not-found without leaking existence",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.at(
        connection,
        {
          policyId: policyB.id,
          featureFlagId: created.id,
        },
      );
    },
  );
}
