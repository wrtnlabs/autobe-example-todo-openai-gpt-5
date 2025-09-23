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

export async function test_api_service_configuration_update_unique_constraint_conflict(
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

  // 2) Create a service policy P
  const policy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: {
          namespace: `core-${RandomGenerator.alphabets(5)}`,
          code: `POL-${RandomGenerator.alphaNumeric(10)}`,
          name: RandomGenerator.name(2),
          value: RandomGenerator.paragraph({ sentences: 6 }),
          value_type: "string",
          active: true,
        } satisfies ITodoAppServicePolicy.ICreate,
      },
    );
  typia.assert(policy);

  // Helper: pick a value_type from allowed EConfigValueType literals
  const valueTypes = [
    "string",
    "int",
    "double",
    "boolean",
    "datetime",
    "uri",
  ] as const;
  const pickedType: EConfigValueType = RandomGenerator.pick(valueTypes);

  // Prepare tuple for configuration A
  const namespaceA = `ns-${RandomGenerator.alphabets(6)}`;
  const keyA = `KEY_${RandomGenerator.alphaNumeric(6)}`;
  const envCandidates = ["prod", "staging", "dev", null] as const;
  const envA: string | null = RandomGenerator.pick(envCandidates);

  // 3) Create configuration A under policy P
  const configA =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.create(
      connection,
      {
        policyId: policy.id,
        body: {
          namespace: namespaceA,
          environment: envA,
          key: keyA,
          value: RandomGenerator.paragraph({ sentences: 8 }),
          value_type: pickedType,
          is_secret: false,
          description: RandomGenerator.paragraph({ sentences: 4 }),
          active: true,
        } satisfies ITodoAppServiceConfiguration.ICreate,
      },
    );
  typia.assert(configA);

  // Prepare distinct tuple for configuration B (ensure different key or env)
  const namespaceB0 = namespaceA; // same namespace
  const keyB0 = `${keyA}_B`; // different key
  // Ensure envB0 differs from envA if possible; if not, keep same (key is already different)
  const otherEnvCandidates = envCandidates.filter((e) => e !== envA);
  const envB0: string | null =
    otherEnvCandidates.length > 0
      ? RandomGenerator.pick(otherEnvCandidates)
      : envA;

  // 4) Create configuration B under policy P with tuple tB0
  const configB =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.create(
      connection,
      {
        policyId: policy.id,
        body: {
          namespace: namespaceB0,
          environment: envB0,
          key: keyB0,
          value: RandomGenerator.paragraph({ sentences: 5 }),
          value_type: pickedType,
          is_secret: false,
          description: RandomGenerator.paragraph({ sentences: 3 }),
          active: true,
        } satisfies ITodoAppServiceConfiguration.ICreate,
      },
    );
  typia.assert(configB);

  // 5) Attempt to update B to collide with A's (namespace, key, environment) → expect error
  await TestValidator.error(
    "updating configuration to duplicate (namespace, key, environment) must fail",
    async () => {
      await api.functional.todoApp.systemAdmin.serviceConfigurations.update(
        connection,
        {
          configurationId: configB.id,
          body: {
            namespace: namespaceA,
            key: keyA,
            environment: envA,
          } satisfies ITodoAppServiceConfiguration.IUpdate,
        },
      );
    },
  );

  // 6) Verify B remains unchanged by applying a safe, non-tuple update
  const newDescription = `updated-desc-${RandomGenerator.alphabets(8)}`;
  const newValue = RandomGenerator.paragraph({ sentences: 7 });
  const updatedB =
    await api.functional.todoApp.systemAdmin.serviceConfigurations.update(
      connection,
      {
        configurationId: configB.id,
        body: {
          description: newDescription,
          value: newValue,
        } satisfies ITodoAppServiceConfiguration.IUpdate,
      },
    );
  typia.assert(updatedB);

  // Business validations: tuple unchanged and benign fields updated
  TestValidator.equals(
    "namespace should remain unchanged after failed duplicate attempt",
    updatedB.namespace,
    configB.namespace,
  );
  TestValidator.equals(
    "key should remain unchanged after failed duplicate attempt",
    updatedB.key,
    configB.key,
  );
  TestValidator.equals(
    "environment should remain unchanged after failed duplicate attempt",
    updatedB.environment,
    configB.environment ?? null,
  );
  TestValidator.equals(
    "description should be updated successfully",
    updatedB.description ?? null,
    newDescription,
  );
  TestValidator.equals(
    "value should be updated successfully",
    updatedB.value,
    newValue,
  );

  // Additionally confirm B's final tuple is not equal to A's tuple
  const tupleA = `${configA.namespace}::${configA.key}::${configA.environment ?? "null"}`;
  const tupleB = `${updatedB.namespace}::${updatedB.key}::${updatedB.environment ?? "null"}`;
  TestValidator.notEquals(
    "configuration B tuple must differ from configuration A tuple",
    tupleB,
    tupleA,
  );
}
