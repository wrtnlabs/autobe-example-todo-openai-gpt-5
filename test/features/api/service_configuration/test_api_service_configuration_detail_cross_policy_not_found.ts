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
 * Ensure configuration detail retrieval is scoped to its owning policy.
 *
 * Scenario:
 *
 * 1. Join as systemAdmin to obtain an authenticated session.
 * 2. Create two policies (policyA and policyB).
 * 3. Create a configuration under policyA.
 * 4. Read the configuration with the correct policyId (policyA) to confirm
 *    success.
 * 5. Attempt to read the same configuration using policyB’s policyId and expect an
 *    error (not-found or equivalent), proving no cross-policy leakage occurs.
 */
export async function test_api_service_configuration_detail_cross_policy_not_found(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
      // Optional client context can be provided
      ip: undefined,
      user_agent: undefined,
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 2) Create two distinct policies
  const policyBodyA = {
    namespace: "core",
    code: `policy-${RandomGenerator.alphaNumeric(8)}`,
    name: RandomGenerator.paragraph({ sentences: 2 }),
    description: RandomGenerator.paragraph({ sentences: 5 }),
    value: "true",
    value_type: "boolean",
    active: true,
    effective_from: new Date().toISOString(),
    effective_to: null,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policyA =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBodyA },
    );
  typia.assert(policyA);

  const policyBodyB = {
    namespace: "core",
    code: `policy-${RandomGenerator.alphaNumeric(8)}`,
    name: RandomGenerator.paragraph({ sentences: 2 }),
    description: RandomGenerator.paragraph({ sentences: 5 }),
    value: "false",
    value_type: "boolean",
    active: true,
    effective_from: new Date().toISOString(),
    effective_to: null,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policyB =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBodyB },
    );
  typia.assert(policyB);

  // 3) Create a configuration under policyA
  const valueTypes = [
    "string",
    "int",
    "double",
    "boolean",
    "datetime",
    "uri",
  ] as const satisfies readonly EConfigValueType[];
  const chosenType = RandomGenerator.pick(valueTypes);

  const configBody = {
    // todo_app_service_policy_id omitted intentionally; provided by path
    namespace: "core",
    environment: "staging",
    key: `cfg-${RandomGenerator.alphaNumeric(10)}`,
    value:
      chosenType === "boolean"
        ? "true"
        : RandomGenerator.paragraph({ sentences: 3 }),
    value_type: chosenType, // ICreate expects string; using allowed literal
    is_secret: false,
    description: RandomGenerator.paragraph({ sentences: 4 }),
    active: true,
    effective_from: new Date().toISOString(),
    effective_to: null,
  } satisfies ITodoAppServiceConfiguration.ICreate;
  const configuration =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.create(
      connection,
      { policyId: policyA.id, body: configBody },
    );
  typia.assert(configuration);

  // 4) Positive control: read with correct policyId should succeed
  const reloaded =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.at(
      connection,
      { policyId: policyA.id, configurationId: configuration.id },
    );
  typia.assert(reloaded);
  TestValidator.equals(
    "reloaded configuration id must match created configuration id",
    reloaded.id,
    configuration.id,
  );

  // 5) Negative case: cross-policy read must fail
  await TestValidator.error(
    "cross-policy configuration access must be denied",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.at(
        connection,
        { policyId: policyB.id, configurationId: configuration.id },
      );
    },
  );
}
