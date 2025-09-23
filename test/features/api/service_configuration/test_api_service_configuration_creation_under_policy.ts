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

export async function test_api_service_configuration_creation_under_policy(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert<ITodoAppSystemAdmin.IAuthorized>(admin);

  // 2) Create a parent service policy to obtain policyId
  const now = new Date();
  const from = new Date(now.getTime() + 60 * 1000).toISOString(); // +1 minute
  const to = new Date(now.getTime() + 60 * 60 * 1000).toISOString(); // +1 hour

  const policyBody = {
    namespace: `policy-${RandomGenerator.alphabets(6)}`,
    code: `code-${RandomGenerator.alphaNumeric(8)}`,
    name: RandomGenerator.name(2),
    description: RandomGenerator.paragraph({ sentences: 5 }),
    value: RandomGenerator.paragraph({ sentences: 6 }),
    value_type: "string",
    active: true,
    effective_from: from,
    effective_to: to,
  } satisfies ITodoAppServicePolicy.ICreate;

  const policy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBody },
    );
  typia.assert<ITodoAppServicePolicy>(policy);

  // 3) Create configuration under the policy
  const envs = ["dev", "staging", "prod"] as const;
  const environment = RandomGenerator.pick(envs);
  const cfgFrom = new Date(now.getTime() + 2 * 60 * 1000).toISOString(); // +2 minutes
  const cfgTo = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(); // +2 hours
  const configValueType: EConfigValueType = "string";

  const createConfigBody = {
    namespace: `cfg-${RandomGenerator.alphabets(5)}`,
    environment,
    key: `key-${RandomGenerator.alphaNumeric(10)}`,
    value: RandomGenerator.paragraph({ sentences: 6 }),
    value_type: configValueType, // ICreate expects string; union literal fits
    is_secret: true,
    description: RandomGenerator.paragraph({ sentences: 4 }),
    active: true,
    effective_from: cfgFrom,
    effective_to: cfgTo,
  } satisfies ITodoAppServiceConfiguration.ICreate;

  const config =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.create(
      connection,
      { policyId: policy.id, body: createConfigBody },
    );
  typia.assert<ITodoAppServiceConfiguration>(config);

  // 4) Basic validations
  TestValidator.equals(
    "configuration is linked to the parent policy",
    config.todo_app_service_policy_id,
    policy.id,
  );
  TestValidator.equals(
    "namespace echoed back",
    config.namespace,
    createConfigBody.namespace,
  );
  TestValidator.equals("key echoed back", config.key, createConfigBody.key);
  TestValidator.equals(
    "environment echoed back",
    config.environment,
    createConfigBody.environment,
  );
  TestValidator.equals(
    "value_type echoed back",
    config.value_type,
    configValueType,
  );
  TestValidator.equals(
    "is_secret echoed back",
    config.is_secret,
    createConfigBody.is_secret,
  );
  TestValidator.equals(
    "active echoed back",
    config.active,
    createConfigBody.active,
  );
  TestValidator.equals(
    "effective_from echoed back",
    config.effective_from,
    createConfigBody.effective_from,
  );
  TestValidator.equals(
    "effective_to echoed back",
    config.effective_to,
    createConfigBody.effective_to,
  );

  await TestValidator.predicate(
    "effective window is coherent (from < to)",
    async () => new Date(cfgFrom).getTime() < new Date(cfgTo).getTime(),
  );

  // 5) Uniqueness validation: duplicate (namespace, key, environment)
  const duplicateBody = {
    ...createConfigBody,
  } satisfies ITodoAppServiceConfiguration.ICreate;

  await TestValidator.error(
    "duplicate (namespace, key, environment) should fail",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.create(
        connection,
        { policyId: policy.id, body: duplicateBody },
      );
    },
  );
}
