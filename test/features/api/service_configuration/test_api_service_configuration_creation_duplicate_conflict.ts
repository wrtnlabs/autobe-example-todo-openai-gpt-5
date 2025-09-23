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
 * Enforce uniqueness of service configuration tuples.
 *
 * Business goal:
 *
 * - Under a service policy, the (namespace, key, environment) tuple must be
 *   unique.
 * - Attempting to create a second configuration with the same tuple should fail.
 *
 * Steps:
 *
 * 1. Authenticate as systemAdmin (token managed by SDK).
 * 2. Create a parent service policy and capture its id.
 * 3. Create an initial configuration with a chosen (namespace, key, environment).
 * 4. Attempt to create a duplicate configuration with the exact same tuple →
 *    expect failure.
 *
 * Validations:
 *
 * - Typia.assert() on all successful responses (auth, policy, first
 *   configuration).
 * - Use TestValidator.error for the duplicate creation attempt (no status/message
 *   assertions).
 */
export async function test_api_service_configuration_creation_duplicate_conflict(
  connection: api.IConnection,
) {
  // Helper: pick a valid config value for a given value_type
  const VALUE_TYPES = [
    "string",
    "int",
    "double",
    "boolean",
    "datetime",
    "uri",
  ] as const;
  const generateValueFor = (t: (typeof VALUE_TYPES)[number]): string => {
    switch (t) {
      case "string":
        return RandomGenerator.paragraph({ sentences: 5 });
      case "int":
        return typia.random<number & tags.Type<"int32">>().toString();
      case "double":
        return typia.random<number>().toString();
      case "boolean":
        return String(RandomGenerator.pick([true, false] as const));
      case "datetime":
        return new Date().toISOString();
      case "uri":
        return `https://example.com/${RandomGenerator.alphabets(12)}`;
    }
  };

  // 1) Authenticate as system administrator
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 2) Create a parent service policy
  const policyValueType = RandomGenerator.pick(VALUE_TYPES);
  const policyBody = {
    namespace: `pol-${RandomGenerator.alphabets(8)}`,
    code: `code_${RandomGenerator.alphabets(12)}`,
    name: RandomGenerator.name(2),
    description: RandomGenerator.paragraph({ sentences: 6 }),
    value: generateValueFor(policyValueType),
    value_type: policyValueType,
    active: true,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBody },
    );
  typia.assert(policy);

  // 3) Create initial configuration under the policy
  const envChoices = ["dev", "staging", "prod"] as const;
  const namespace = `core.${RandomGenerator.alphabets(6)}`;
  const environment = RandomGenerator.pick(envChoices);
  const configKey = `feature_${RandomGenerator.alphabets(6)}`;
  const cfgType = RandomGenerator.pick(VALUE_TYPES);

  const firstConfigBody = {
    namespace,
    environment,
    key: configKey,
    value: generateValueFor(cfgType),
    value_type: cfgType,
    is_secret: false,
    description: RandomGenerator.paragraph({ sentences: 5 }),
    active: true,
  } satisfies ITodoAppServiceConfiguration.ICreate;
  const first =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.create(
      connection,
      {
        policyId: policy.id,
        body: firstConfigBody,
      },
    );
  typia.assert(first);

  // 4) Attempt a duplicate configuration with the same (namespace, key, environment)
  const duplicateBody = {
    namespace,
    environment, // must be identical to trigger the unique-constraint violation
    key: configKey,
    value: generateValueFor(cfgType),
    value_type: cfgType,
    is_secret: false,
    description: RandomGenerator.paragraph({ sentences: 4 }),
    active: true,
  } satisfies ITodoAppServiceConfiguration.ICreate;
  await TestValidator.error(
    "duplicate (namespace, key, environment) under same policy must be rejected",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.create(
        connection,
        {
          policyId: policy.id,
          body: duplicateBody,
        },
      );
    },
  );
}
