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
 * Create a Feature Flag linked to a Service Policy as a system administrator.
 *
 * Steps:
 *
 * 1. Join as systemAdmin to obtain authorization (SDK stores token automatically).
 * 2. Create a Service Policy and capture its id.
 * 3. Create a Feature Flag linking todo_app_service_policy_id to the policy id,
 *    with coherent start/end timestamps and a valid rollout percentage.
 * 4. Validate business rules:
 *
 *    - Flag is linked to the policy (id equality)
 *    - Start_at < end_at (chronological coherence)
 *    - Echo validations on namespace/code/environment
 * 5. Attempt to create a duplicate Feature Flag with the same (namespace, code,
 *    environment) and expect an error due to uniqueness constraint.
 */
export async function test_api_feature_flag_creation_with_policy(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 2) Create a Service Policy to link
  const policyStart = new Date();
  const policyEnd = new Date(policyStart.getTime() + 60 * 60 * 1000); // +1 hour
  const policy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: {
          namespace: `policy-${RandomGenerator.alphabets(6)}`,
          code: `POL_${RandomGenerator.alphaNumeric(8)}`,
          name: RandomGenerator.paragraph({ sentences: 3 }),
          description: RandomGenerator.paragraph({ sentences: 6 }),
          value: "true",
          value_type: "boolean",
          active: true,
          effective_from: policyStart.toISOString(),
          effective_to: policyEnd.toISOString(),
        } satisfies ITodoAppServicePolicy.ICreate,
      },
    );
  typia.assert(policy);

  // 3) Create a Feature Flag linked to the created policy
  const envs = ["dev", "staging", "prod"] as const;
  const environment = RandomGenerator.pick(envs);
  const startAt = new Date();
  const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000); // +2 hours
  const rollout = typia.random<
    number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
  >();

  const namespace = `ff-${RandomGenerator.alphabets(6)}`;
  const code = `FF_${RandomGenerator.alphaNumeric(10)}`;

  const flag = await api.functional.todoApp.systemAdmin.featureFlags.create(
    connection,
    {
      body: {
        namespace,
        environment,
        code,
        name: RandomGenerator.paragraph({ sentences: 2 }),
        description: RandomGenerator.paragraph({ sentences: 5 }),
        active: true,
        rollout_percentage: rollout,
        target_audience: RandomGenerator.paragraph({ sentences: 4 }),
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        todo_app_service_policy_id: policy.id,
      } satisfies ITodoAppFeatureFlag.ICreate,
    },
  );
  typia.assert(flag);

  // Business validations (no type/schema re-validation)
  TestValidator.equals(
    "feature flag namespace must match input",
    flag.namespace,
    namespace,
  );
  TestValidator.equals("feature flag code must match input", flag.code, code);
  TestValidator.equals(
    "feature flag environment must match input",
    flag.environment,
    environment,
  );
  TestValidator.predicate(
    "feature flag must be linked to a policy (non-null id)",
    flag.todo_app_service_policy_id !== null &&
      flag.todo_app_service_policy_id !== undefined,
  );
  TestValidator.equals(
    "feature flag should link to created policy id",
    flag.todo_app_service_policy_id,
    policy.id,
  );

  // start_at / end_at coherence (use response values)
  if (
    flag.start_at !== null &&
    flag.start_at !== undefined &&
    flag.end_at !== null &&
    flag.end_at !== undefined
  ) {
    const s = Date.parse(flag.start_at);
    const e = Date.parse(flag.end_at);
    TestValidator.predicate(
      "feature flag end_at must be after start_at",
      e > s,
    );
  }

  // 5) Uniqueness: duplicate creation should error (same namespace, code, environment)
  await TestValidator.error(
    "duplicate feature flag (namespace, code, environment) must fail",
    async () => {
      await api.functional.todoApp.systemAdmin.featureFlags.create(connection, {
        body: {
          namespace,
          environment,
          code,
          name: RandomGenerator.paragraph({ sentences: 2 }),
          description: RandomGenerator.paragraph({ sentences: 3 }),
          active: true,
          rollout_percentage: rollout,
          target_audience: RandomGenerator.paragraph({ sentences: 2 }),
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
          todo_app_service_policy_id: policy.id,
        } satisfies ITodoAppFeatureFlag.ICreate,
      });
    },
  );
}
