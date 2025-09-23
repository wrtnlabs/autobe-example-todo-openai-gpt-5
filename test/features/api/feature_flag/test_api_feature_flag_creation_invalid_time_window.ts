import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppFeatureFlag } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppFeatureFlag";
import type { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

export async function test_api_feature_flag_creation_invalid_time_window(
  connection: api.IConnection,
) {
  /**
   * Validate feature flag time window coherence under a service policy.
   *
   * Business context: Feature flags optionally define evaluation windows using
   * start_at and end_at. When both timestamps are provided, end_at must be
   * strictly after start_at. This test ensures the backend rejects incoherent
   * windows.
   *
   * Steps:
   *
   * 1. Admin joins to obtain authorization (systemAdmin context).
   * 2. Create a parent Service Policy to scope the feature flag.
   * 3. Attempt to create a feature flag with end_at earlier than start_at and
   *    expect a validation error.
   */

  // 1) Admin join (authorization is auto-applied by the SDK)
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 2) Create a parent Service Policy
  const policy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: {
          namespace: "feature",
          code: `policy_${RandomGenerator.alphaNumeric(10)}`,
          name: RandomGenerator.paragraph({ sentences: 3 }),
          description: RandomGenerator.paragraph({ sentences: 8 }),
          value: "1",
          value_type: "int",
          active: true,
        } satisfies ITodoAppServicePolicy.ICreate,
      },
    );
  typia.assert(policy);

  // 3) Try to create a feature flag with invalid time window (end_at < start_at)
  const now = new Date();
  const startAt = new Date(
    now.getTime() + 1000 * 60 * 60 * 24 * 2,
  ).toISOString(); // +2 days
  const endAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 1).toISOString(); // +1 day (earlier than startAt)

  await TestValidator.error(
    "feature flag creation should fail when end_at precedes start_at",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
        connection,
        {
          policyId: policy.id,
          body: {
            namespace: "feature",
            environment: "dev",
            code: `ff_${RandomGenerator.alphaNumeric(12)}`,
            name: RandomGenerator.paragraph({ sentences: 3 }),
            description: RandomGenerator.paragraph({ sentences: 10 }),
            active: true,
            rollout_percentage: 50,
            target_audience: RandomGenerator.paragraph({ sentences: 6 }),
            start_at: startAt,
            end_at: endAt,
          } satisfies ITodoAppFeatureFlag.ICreate,
        },
      );
    },
  );
}
