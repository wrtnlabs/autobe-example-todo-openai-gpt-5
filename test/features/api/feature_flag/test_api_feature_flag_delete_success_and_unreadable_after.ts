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
 * Delete a Feature Flag and verify it no longer blocks creation with the same
 * uniqueness tuple.
 *
 * Rationale: The provided SDK does not include a GET endpoint to read a feature
 * flag by id after deletion. Therefore, "unreadable after" is validated
 * indirectly by attempting to re-create a flag with the same (namespace, code,
 * environment) post-deletion and expecting success with a new id.
 *
 * Steps:
 *
 * 1. Join as system admin (auth token handled by SDK)
 * 2. Create a service policy (optional governance linkage)
 * 3. Create a feature flag (namespace/code/environment unique tuple)
 * 4. Delete the feature flag by id
 * 5. Re-create the feature flag with the exact same tuple and validate a new id is
 *    issued
 */
export async function test_api_feature_flag_delete_success_and_unreadable_after(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: adminJoinBody,
    });
  typia.assert(adminAuth);

  // 2) Create a service policy to associate with the feature flag
  const policyCode = `policy_${RandomGenerator.alphaNumeric(8)}`;
  const policyBody = {
    namespace: "feature",
    code: policyCode,
    name: `Policy ${RandomGenerator.name(1)}`,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    value: "true",
    value_type: "boolean",
    active: true,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBody },
    );
  typia.assert(policy);

  // 3) Create a feature flag with a unique tuple (namespace, code, environment)
  const flagNamespace = "ui";
  const flagEnvironment = "dev";
  const flagCode = `flag_${RandomGenerator.alphaNumeric(10)}`;
  const createFlagBody = {
    namespace: flagNamespace,
    environment: flagEnvironment,
    code: flagCode,
    name: `FF ${RandomGenerator.name(1)}`,
    description: RandomGenerator.paragraph({ sentences: 8 }),
    active: true,
    rollout_percentage: 100,
    target_audience: RandomGenerator.paragraph({ sentences: 4 }),
    todo_app_service_policy_id: policy.id,
  } satisfies ITodoAppFeatureFlag.ICreate;
  const createdFlag: ITodoAppFeatureFlag =
    await api.functional.todoApp.systemAdmin.featureFlags.create(connection, {
      body: createFlagBody,
    });
  typia.assert(createdFlag);

  // 4) Delete the feature flag by id
  await api.functional.todoApp.systemAdmin.featureFlags.erase(connection, {
    featureFlagId: createdFlag.id,
  });

  // 5) Re-create with the same uniqueness tuple (namespace/code/environment) and validate
  const recreateFlagBody = {
    namespace: flagNamespace,
    environment: flagEnvironment,
    code: flagCode,
    name: `FF ${RandomGenerator.name(1)} (recreated)`,
    description: RandomGenerator.paragraph({ sentences: 5 }),
    active: true,
    rollout_percentage: 100,
    target_audience: RandomGenerator.paragraph({ sentences: 3 }),
    todo_app_service_policy_id: policy.id,
  } satisfies ITodoAppFeatureFlag.ICreate;
  const recreatedFlag: ITodoAppFeatureFlag =
    await api.functional.todoApp.systemAdmin.featureFlags.create(connection, {
      body: recreateFlagBody,
    });
  typia.assert(recreatedFlag);

  // Business validations
  TestValidator.equals(
    "recreated flag uses same namespace",
    recreatedFlag.namespace,
    flagNamespace,
  );
  TestValidator.equals(
    "recreated flag uses same code",
    recreatedFlag.code,
    flagCode,
  );
  TestValidator.equals(
    "recreated flag uses same environment",
    recreatedFlag.environment,
    flagEnvironment,
  );
  TestValidator.notEquals(
    "recreated flag must have a new id (old logically removed)",
    recreatedFlag.id,
    createdFlag.id,
  );
}
