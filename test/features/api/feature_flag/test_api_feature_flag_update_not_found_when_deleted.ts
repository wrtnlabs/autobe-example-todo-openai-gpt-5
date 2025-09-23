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
 * Update attempt on a soft-deleted Feature Flag must fail.
 *
 * Steps:
 *
 * 1. System admin joins to obtain an authorized session.
 * 2. Create a Service Policy for linkage.
 * 3. Create a Feature Flag linked to the policy.
 * 4. Soft-delete the Feature Flag.
 * 5. Attempt to update the deleted flag and expect an error.
 */
export async function test_api_feature_flag_update_not_found_when_deleted(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: `P${RandomGenerator.alphaNumeric(11)}`,
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 2) Create a Service Policy
  const policy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: {
          namespace: "feature",
          code: `policy_${RandomGenerator.alphaNumeric(8)}`,
          name: RandomGenerator.paragraph({ sentences: 2 }),
          description: RandomGenerator.paragraph({ sentences: 6 }),
          value: "true",
          value_type: "boolean",
          active: true,
        } satisfies ITodoAppServicePolicy.ICreate,
      },
    );
  typia.assert(policy);

  // 3) Create a Feature Flag
  const flag = await api.functional.todoApp.systemAdmin.featureFlags.create(
    connection,
    {
      body: {
        namespace: "ui",
        environment: "staging",
        code: `flag_${RandomGenerator.alphaNumeric(8)}`,
        name: RandomGenerator.paragraph({ sentences: 2 }),
        description: RandomGenerator.paragraph({ sentences: 5 }),
        active: true,
        rollout_percentage: typia.random<
          number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
        >(),
        target_audience: RandomGenerator.paragraph({ sentences: 3 }),
        start_at: new Date().toISOString(),
        end_at: null,
        todo_app_service_policy_id: policy.id,
      } satisfies ITodoAppFeatureFlag.ICreate,
    },
  );
  typia.assert(flag);

  // 4) Delete the Feature Flag
  await api.functional.todoApp.systemAdmin.featureFlags.erase(connection, {
    featureFlagId: flag.id,
  });

  // 5) Update must fail because the flag is soft-deleted
  await TestValidator.error(
    "updating a soft-deleted feature flag must fail",
    async () => {
      await api.functional.todoApp.systemAdmin.featureFlags.update(connection, {
        featureFlagId: flag.id,
        body: {
          name: RandomGenerator.paragraph({ sentences: 2 }),
          active: false,
          rollout_percentage: typia.random<
            number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
          >(),
        } satisfies ITodoAppFeatureFlag.IUpdate,
      });
    },
  );
}
