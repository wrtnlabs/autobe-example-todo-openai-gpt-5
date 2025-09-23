import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppFeatureFlag } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppFeatureFlag";
import type { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

export async function test_api_feature_flag_delete_idempotent_when_already_removed(
  connection: api.IConnection,
) {
  /**
   * Validate idempotent DELETE on already-removed Feature Flag.
   *
   * Steps:
   *
   * 1. Join as system admin (authorization handled by SDK token propagation)
   * 2. Create a Service Policy (parent of feature flags)
   * 3. Create a Feature Flag under the policy
   * 4. DELETE the Feature Flag (soft-delete)
   * 5. DELETE again to verify idempotency (should not throw)
   */

  // 1) System admin join (auth)
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 2) Create Service Policy
  const now = new Date();
  const later = new Date(now.getTime() + 60 * 60 * 1000); // +1 hour
  const policy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: {
          namespace: `flags-${RandomGenerator.alphabets(6)}`,
          code: `policy_${RandomGenerator.alphaNumeric(10)}`,
          name: `Policy ${RandomGenerator.name(2)}`,
          description: RandomGenerator.paragraph({ sentences: 6 }),
          value: "true",
          value_type: "boolean",
          active: true,
          effective_from: now.toISOString(),
          effective_to: later.toISOString(),
        } satisfies ITodoAppServicePolicy.ICreate,
      },
    );
  typia.assert(policy);

  // 3) Create Feature Flag under the policy
  const startAt = new Date(now.getTime() + 5 * 60 * 1000); // +5 minutes
  const endAt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // +2 hours
  const flag =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
      connection,
      {
        policyId: policy.id,
        body: {
          namespace: `ui-${RandomGenerator.alphabets(5)}`,
          environment: RandomGenerator.pick([
            "dev",
            "staging",
            "prod",
          ] as const),
          code: `flag_${RandomGenerator.alphaNumeric(8)}`,
          name: `Flag ${RandomGenerator.name(1)}`,
          description: RandomGenerator.paragraph({ sentences: 8 }),
          active: true,
          rollout_percentage: typia.random<
            number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
          >(),
          target_audience: RandomGenerator.paragraph({ sentences: 5 }),
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
        } satisfies ITodoAppFeatureFlag.ICreate,
      },
    );
  typia.assert(flag);

  // 4) First DELETE: soft-remove the feature flag
  await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.erase(
    connection,
    {
      policyId: policy.id,
      featureFlagId: flag.id,
    },
  );

  // 5) Second DELETE: idempotent behavior (should not throw)
  let repeatedDeleteSucceeded = true;
  try {
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.erase(
      connection,
      {
        policyId: policy.id,
        featureFlagId: flag.id,
      },
    );
  } catch {
    repeatedDeleteSucceeded = false;
  }
  TestValidator.predicate(
    "repeating DELETE on an already-removed feature flag succeeds (idempotent)",
    repeatedDeleteSucceeded,
  );
}
