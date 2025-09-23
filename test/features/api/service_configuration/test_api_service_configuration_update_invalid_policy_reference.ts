import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { EConfigValueType } from "@ORGANIZATION/PROJECT-api/lib/structures/EConfigValueType";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppServiceConfiguration } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServiceConfiguration";
import type { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

export async function test_api_service_configuration_update_invalid_policy_reference(
  connection: api.IConnection,
) {
  /**
   * Validate that updating a configuration to reference a non-existent policy
   * fails.
   *
   * Steps:
   *
   * 1. Authenticate as systemAdmin
   * 2. Create a service policy
   * 3. Create a configuration under that policy
   * 4. Try to update the configuration with a random (non-existent) policy id →
   *    expect error
   * 5. Perform a valid update (change value) and verify policy linkage remains
   */

  // 1) Authenticate as systemAdmin (SDK manages token automatically)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
    user_agent: "Nestia/E2E",
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, { body: joinBody });
  typia.assert(adminAuth);

  // 2) Create a service policy
  const policyBody = {
    namespace: "auth",
    code: `policy_${RandomGenerator.alphaNumeric(8)}`,
    name: RandomGenerator.paragraph({ sentences: 2 }),
    description: RandomGenerator.paragraph({ sentences: 6 }),
    value: "true",
    value_type: "boolean",
    active: true,
    effective_from: new Date().toISOString(),
    effective_to: null,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: policyBody,
      },
    );
  typia.assert(policy);

  // 3) Create a configuration under the created policy
  const valueType: EConfigValueType = "string";
  const configCreateBody = {
    namespace: "core",
    environment: "dev",
    key: `cfg_${RandomGenerator.alphaNumeric(6)}`,
    value: "on",
    value_type: valueType,
    is_secret: false,
    description: RandomGenerator.paragraph({ sentences: 4 }),
    active: true,
    effective_from: null,
    effective_to: null,
  } satisfies ITodoAppServiceConfiguration.ICreate;
  const config: ITodoAppServiceConfiguration =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.create(
      connection,
      {
        policyId: policy.id,
        body: configCreateBody,
      },
    );
  typia.assert(config);

  // Confirm linkage to policy
  TestValidator.equals(
    "configuration must be linked to the created policy",
    config.todo_app_service_policy_id,
    policy.id,
  );

  // 4) Attempt invalid policy reassignment → expect error
  const nonExistingPolicyId = typia.random<string & tags.Format<"uuid">>();
  await TestValidator.error(
    "updating configuration with non-existent policy id must fail",
    async () => {
      await api.functional.todoApp.systemAdmin.serviceConfigurations.update(
        connection,
        {
          configurationId: config.id,
          body: {
            todo_app_service_policy_id: nonExistingPolicyId,
          } satisfies ITodoAppServiceConfiguration.IUpdate,
        },
      );
    },
  );

  // 5) Positive control: perform a valid update (change value) and verify linkage remains
  const newValue: string = RandomGenerator.paragraph({ sentences: 3 });
  const updated: ITodoAppServiceConfiguration =
    await api.functional.todoApp.systemAdmin.serviceConfigurations.update(
      connection,
      {
        configurationId: config.id,
        body: {
          value: newValue,
        } satisfies ITodoAppServiceConfiguration.IUpdate,
      },
    );
  typia.assert(updated);

  TestValidator.equals(
    "policy linkage remains after failed reassignment",
    updated.todo_app_service_policy_id,
    policy.id,
  );
  TestValidator.equals("value field must be updated", updated.value, newValue);
}
