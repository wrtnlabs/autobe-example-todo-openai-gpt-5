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

/**
 * Create a service configuration bound to a policy with a coherent effective
 * window.
 *
 * Steps:
 *
 * 1. Join as systemAdmin to obtain authorized context
 * 2. Create a service policy for linkage
 * 3. Create a service configuration with value/value_type coherence, secret flag,
 *    and effectivity window
 * 4. Validate response fields match request inputs and linkage to policy id
 * 5. Attempt duplicate creation to ensure (namespace, key, environment) uniqueness
 */
export async function test_api_service_configuration_creation_with_policy_and_effectivity_window(
  connection: api.IConnection,
) {
  // 1) Authenticate (join) as system administrator
  const adminEmail = typia.random<string & tags.Format<"email">>();
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: adminEmail,
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(adminAuth);

  // Prepare a coherent effective window (from < to)
  const now = new Date();
  const effectiveFrom = new Date(now.getTime() + 5 * 60 * 1000).toISOString(); // +5 minutes
  const effectiveTo = new Date(now.getTime() + 65 * 60 * 1000).toISOString(); // +65 minutes

  // 2) Create a service policy for linkage
  const policyBody = {
    namespace: "core",
    code: `pol_${RandomGenerator.alphaNumeric(10)}`,
    name: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.paragraph({ sentences: 8 }),
    value: "true",
    value_type: "boolean",
    active: true,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: policyBody,
      },
    );
  typia.assert(policy);

  // Pick a config value_type and generate a coherent value string for it
  const valueTypes = [
    "string",
    "int",
    "double",
    "boolean",
    "datetime",
    "uri",
  ] as const;
  const valueType: EConfigValueType = RandomGenerator.pick(valueTypes);
  const genValue = (): string => {
    switch (valueType) {
      case "string":
        return RandomGenerator.paragraph({ sentences: 5 });
      case "int":
        return String(typia.random<number & tags.Type<"int32">>());
      case "double":
        return String(typia.random<number>());
      case "boolean":
        return RandomGenerator.pick(["true", "false"] as const);
      case "datetime": {
        const dt = new Date(now.getTime() + 30 * 60 * 1000); // +30 minutes
        return dt.toISOString();
      }
      case "uri":
        return typia.random<string & tags.Format<"uri">>();
    }
  };
  const cfgNamespace = "core";
  const cfgEnvironment = "prod";
  const cfgKey = `feature_${RandomGenerator.alphaNumeric(12)}`;
  const cfgValue = genValue();

  // 3) Create a service configuration
  const createCfgBody = {
    todo_app_service_policy_id: policy.id,
    namespace: cfgNamespace,
    environment: cfgEnvironment,
    key: cfgKey,
    value: cfgValue,
    value_type: valueType,
    is_secret: true,
    description: RandomGenerator.paragraph({ sentences: 4 }),
    active: true,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
  } satisfies ITodoAppServiceConfiguration.ICreate;
  const created: ITodoAppServiceConfiguration =
    await api.functional.todoApp.systemAdmin.serviceConfigurations.create(
      connection,
      { body: createCfgBody },
    );
  typia.assert(created);

  // 4) Business validations
  TestValidator.equals(
    "policy linkage preserved",
    created.todo_app_service_policy_id,
    policy.id,
  );
  TestValidator.equals("namespace preserved", created.namespace, cfgNamespace);
  TestValidator.equals(
    "environment preserved",
    created.environment,
    cfgEnvironment,
  );
  TestValidator.equals("key preserved", created.key, cfgKey);
  TestValidator.equals("value preserved", created.value, cfgValue);
  TestValidator.equals("value_type preserved", created.value_type, valueType);
  TestValidator.equals("is_secret preserved", created.is_secret, true);
  TestValidator.equals("active preserved", created.active, true);
  TestValidator.equals(
    "effective_from preserved",
    created.effective_from,
    effectiveFrom,
  );
  TestValidator.equals(
    "effective_to preserved",
    created.effective_to,
    effectiveTo,
  );
  await TestValidator.predicate(
    "effective window coherent (from < to)",
    async () =>
      new Date(typia.assert<string>(created.effective_from!)).getTime() <
      new Date(typia.assert<string>(created.effective_to!)).getTime(),
  );

  // 5) Error scenario: try to create a duplicate (namespace, key, environment)
  await TestValidator.error(
    "duplicate (namespace, key, environment) must fail",
    async () => {
      await api.functional.todoApp.systemAdmin.serviceConfigurations.create(
        connection,
        { body: createCfgBody },
      );
    },
  );
}
