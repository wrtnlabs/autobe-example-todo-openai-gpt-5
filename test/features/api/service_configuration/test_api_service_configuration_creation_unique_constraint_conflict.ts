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

export async function test_api_service_configuration_creation_unique_constraint_conflict(
  connection: api.IConnection,
) {
  /**
   * Validate uniqueness constraint for service configurations on (namespace,
   * key, environment).
   *
   * Steps:
   *
   * 1. Join as systemAdmin to obtain authorization.
   * 2. Create a governing service policy and capture its id.
   * 3. Create an initial configuration with (namespace, key, environment="prod").
   * 4. Attempt to create a duplicate configuration with the same tuple → expect
   *    error.
   * 5. Create another configuration with the same namespace/key but
   *    environment="staging" → expect success.
   */

  // 1) Authenticate as systemAdmin
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
      user_agent: "e2e/service-config-unique",
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 2) Create a service policy
  const policyBody = {
    namespace: `policy_${RandomGenerator.alphabets(6)}`,
    code: `pol_${RandomGenerator.alphaNumeric(12)}`,
    name: RandomGenerator.name(2),
    description: RandomGenerator.paragraph({ sentences: 6 }),
    value: "enabled",
    value_type: "string",
    active: true,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBody },
    );
  typia.assert(policy);
  TestValidator.equals(
    "created policy code echoes input",
    policy.code,
    policyBody.code,
  );

  // Common tuple components for configuration
  const namespace = `core_${RandomGenerator.alphabets(5)}`;
  const key = `feature_${RandomGenerator.alphaNumeric(8)}`;
  const envProd = "prod";

  // 3) Create initial configuration (namespace, key, environment="prod")
  const createConfigBody1 = {
    todo_app_service_policy_id: policy.id,
    namespace,
    environment: envProd,
    key,
    value: "on",
    value_type: "string",
    is_secret: false,
    description: RandomGenerator.paragraph({ sentences: 5 }),
    active: true,
  } satisfies ITodoAppServiceConfiguration.ICreate;
  const config1 =
    await api.functional.todoApp.systemAdmin.serviceConfigurations.create(
      connection,
      { body: createConfigBody1 },
    );
  typia.assert(config1);
  TestValidator.equals(
    "config1 namespace matches",
    config1.namespace,
    namespace,
  );
  TestValidator.equals("config1 key matches", config1.key, key);
  TestValidator.equals(
    "config1 environment matches",
    config1.environment,
    envProd,
  );
  TestValidator.equals(
    "config1 value_type is 'string'",
    config1.value_type,
    "string" as EConfigValueType,
  );
  // Narrow optional FK before equality for clarity
  if (
    config1.todo_app_service_policy_id !== null &&
    config1.todo_app_service_policy_id !== undefined
  ) {
    TestValidator.equals(
      "config1 linked policy id echoes",
      config1.todo_app_service_policy_id,
      policy.id,
    );
  } else {
    throw new Error("Expected config1 to link the governing policy id");
  }

  // 4) Duplicate attempt with the same (namespace, key, environment)
  const createConfigBodyDup = {
    todo_app_service_policy_id: policy.id,
    namespace,
    environment: envProd,
    key,
    value: "on",
    value_type: "string",
    is_secret: false,
    description: RandomGenerator.paragraph({ sentences: 3 }),
    active: true,
  } satisfies ITodoAppServiceConfiguration.ICreate;
  await TestValidator.error(
    "duplicate configuration tuple should be rejected",
    async () => {
      await api.functional.todoApp.systemAdmin.serviceConfigurations.create(
        connection,
        { body: createConfigBodyDup },
      );
    },
  );

  // 5) Same namespace/key but different environment should succeed
  const envStaging = "staging";
  const createConfigBody2 = {
    todo_app_service_policy_id: policy.id,
    namespace,
    environment: envStaging,
    key,
    value: "off",
    value_type: "string",
    is_secret: false,
    description: RandomGenerator.paragraph({ sentences: 4 }),
    active: true,
  } satisfies ITodoAppServiceConfiguration.ICreate;
  const config2 =
    await api.functional.todoApp.systemAdmin.serviceConfigurations.create(
      connection,
      { body: createConfigBody2 },
    );
  typia.assert(config2);
  TestValidator.equals(
    "config2 namespace matches input",
    config2.namespace,
    namespace,
  );
  TestValidator.equals("config2 key matches input", config2.key, key);
  TestValidator.equals(
    "config2 environment is 'staging'",
    config2.environment,
    envStaging,
  );
  TestValidator.equals(
    "config2 value_type is 'string'",
    config2.value_type,
    "string" as EConfigValueType,
  );
}
