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
 * Verify idempotent deletion of a service configuration.
 *
 * Business flow:
 *
 * 1. Authenticate as system admin.
 * 2. Create a parent service policy.
 * 3. Create a configuration under the policy.
 * 4. Delete the configuration.
 * 5. Confirm GET fails after deletion.
 * 6. Repeat DELETE on the same configuration (idempotent) — should not error.
 * 7. Confirm GET still fails.
 */
export async function test_api_service_configuration_deletion_idempotent_repeated_delete(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
      ip: "127.0.0.1",
      user_agent: `e2e/${RandomGenerator.alphaNumeric(8)}`,
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // Common date-time window used by created records
  const now = new Date();
  const startAt = now.toISOString();
  const endAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString(); // +1 hour

  // 2) Create a service policy
  const policyBody = {
    namespace: "auth",
    code: `pol_${RandomGenerator.alphaNumeric(12)}`,
    name: RandomGenerator.name(3),
    description: RandomGenerator.paragraph({ sentences: 6 }),
    value: "7200", // e.g., numeric value encoded as string
    value_type: "int", // hint for consumers
    active: true,
    effective_from: startAt,
    effective_to: endAt,
  } satisfies ITodoAppServicePolicy.ICreate;

  const policy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBody },
    );
  typia.assert(policy);

  // 3) Create a configuration under the created policy
  const configValueType: EConfigValueType = RandomGenerator.pick([
    "string",
    "int",
    "double",
    "boolean",
    "datetime",
    "uri",
  ] as const);
  // choose a compatible literal value according to the selected value_type
  const configValue: string = (() => {
    switch (configValueType) {
      case "string":
        return RandomGenerator.paragraph({ sentences: 4 });
      case "int":
        return `${Math.floor(Math.random() * 1000)}`;
      case "double":
        return `${(Math.random() * 1000).toFixed(6)}`;
      case "boolean":
        return Math.random() < 0.5 ? "true" : "false";
      case "datetime":
        return new Date().toISOString();
      case "uri":
        return typia.random<string & tags.Format<"url">>();
    }
  })();

  const configBody = {
    namespace: "core",
    environment: "prod",
    key: `cfg_${RandomGenerator.alphaNumeric(10)}`,
    value: configValue,
    value_type: configValueType, // ICreate expects string; union literal is assignable
    is_secret: false,
    description: RandomGenerator.paragraph({ sentences: 5 }),
    active: true,
    effective_from: startAt,
    effective_to: endAt,
  } satisfies ITodoAppServiceConfiguration.ICreate;

  const configuration =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.create(
      connection,
      {
        policyId: policy.id,
        body: configBody,
      },
    );
  typia.assert(configuration);

  // Basic field echoes
  TestValidator.equals(
    "created configuration namespace matches input",
    configuration.namespace,
    configBody.namespace,
  );
  TestValidator.equals(
    "created configuration key matches input",
    configuration.key,
    configBody.key,
  );
  TestValidator.equals(
    "created configuration is_secret matches input",
    configuration.is_secret,
    configBody.is_secret,
  );
  TestValidator.equals(
    "created configuration active matches input",
    configuration.active,
    configBody.active,
  );
  // If the service returns the linked policy id, ensure it matches
  if (
    configuration.todo_app_service_policy_id !== null &&
    configuration.todo_app_service_policy_id !== undefined
  ) {
    TestValidator.equals(
      "configuration linked policy id matches parent",
      configuration.todo_app_service_policy_id,
      policy.id,
    );
  }

  // 4) Delete the configuration (first time)
  await api.functional.todoApp.systemAdmin.serviceConfigurations.erase(
    connection,
    { configurationId: configuration.id },
  );

  // 5) Confirm GET fails after first deletion
  await TestValidator.error("GET after deletion must fail", async () => {
    await api.functional.todoApp.systemAdmin.serviceConfigurations.at(
      connection,
      { configurationId: configuration.id },
    );
  });

  // 6) Delete the configuration again (idempotent delete)
  await api.functional.todoApp.systemAdmin.serviceConfigurations.erase(
    connection,
    { configurationId: configuration.id },
  );

  // 7) Confirm GET still fails after repeated deletion
  await TestValidator.error(
    "GET after repeated deletion must still fail",
    async () => {
      await api.functional.todoApp.systemAdmin.serviceConfigurations.at(
        connection,
        { configurationId: configuration.id },
      );
    },
  );
}
