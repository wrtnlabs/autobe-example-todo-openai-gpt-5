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
 * Validate uniqueness conflict when updating a service configuration's tuple.
 *
 * This e2e test verifies that updating a configuration under a policy to a
 * (namespace, key, environment) tuple that already exists is rejected, and that
 * the original record remains unchanged after the failed attempt.
 *
 * Steps:
 *
 * 1. Join as system admin (auth). The SDK manages Authorization headers.
 * 2. Create a service policy and capture its id.
 * 3. Create two configurations with distinct tuples under the same policy.
 * 4. Attempt to update the 2nd configuration so that its tuple matches the 1st;
 *    expect error.
 * 5. Perform a safe update (change non-unique field like value) to ensure the 2nd
 *    config is intact and tuple is unchanged.
 */
export async function test_api_service_configuration_update_uniqueness_conflict(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const authorized = await api.functional.auth.systemAdmin.join(connection, {
    body: adminJoinBody,
  });
  typia.assert<ITodoAppSystemAdmin.IAuthorized>(authorized);

  // 2) Create a service policy
  const policyBody = {
    namespace: "platform",
    code: `policy_${RandomGenerator.alphaNumeric(8)}`,
    name: `Policy ${RandomGenerator.name(2)}`,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    value: RandomGenerator.paragraph({ sentences: 8 }),
    value_type: "string",
    active: true,
    effective_from: null,
    effective_to: null,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBody },
    );
  typia.assert<ITodoAppServicePolicy>(policy);

  // 3) Create two configurations with distinct tuples
  const ns = `ns_${RandomGenerator.alphaNumeric(6)}`;
  const env1 = "dev";
  const env2 = "prod";
  const key1 = `KEY_${RandomGenerator.alphaNumeric(6)}`;
  const key2 = `${key1}_B`; // guarantee a different key from key1

  const cfgCreate1 = {
    namespace: ns,
    environment: env1,
    key: key1,
    value: "v1",
    value_type: "string",
    is_secret: false,
    description: RandomGenerator.paragraph({ sentences: 4 }),
    active: true,
  } satisfies ITodoAppServiceConfiguration.ICreate;
  const cfg1 =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.create(
      connection,
      { policyId: policy.id, body: cfgCreate1 },
    );
  typia.assert<ITodoAppServiceConfiguration>(cfg1);

  const cfgCreate2 = {
    namespace: ns,
    environment: env2,
    key: key2,
    value: "v2",
    value_type: "string",
    is_secret: false,
    description: RandomGenerator.paragraph({ sentences: 4 }),
    active: true,
  } satisfies ITodoAppServiceConfiguration.ICreate;
  const cfg2 =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.create(
      connection,
      { policyId: policy.id, body: cfgCreate2 },
    );
  typia.assert<ITodoAppServiceConfiguration>(cfg2);

  // Sanity checks on setup
  TestValidator.notEquals(
    "two configs must have different IDs",
    cfg1.id,
    cfg2.id,
  );
  TestValidator.notEquals("keys differ initially", cfg1.key, cfg2.key);
  TestValidator.notEquals(
    "environments differ initially",
    cfg1.environment,
    cfg2.environment ?? null,
  );

  // 4) Attempt to update cfg2 to match cfg1's tuple → expect uniqueness conflict
  await TestValidator.error(
    "updating to duplicate (namespace,key,environment) must fail",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.update(
        connection,
        {
          policyId: policy.id,
          configurationId: cfg2.id,
          body: {
            namespace: ns,
            key: key1,
            environment: env1,
          } satisfies ITodoAppServiceConfiguration.IUpdate,
        },
      );
    },
  );

  // 5) Ensure cfg2 remains unchanged by performing a safe update that does not touch the tuple
  const safeUpdate =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.update(
      connection,
      {
        policyId: policy.id,
        configurationId: cfg2.id,
        body: {
          value: "safe-update",
        } satisfies ITodoAppServiceConfiguration.IUpdate,
      },
    );
  typia.assert<ITodoAppServiceConfiguration>(safeUpdate);

  // Tuple integrity: remains equal to original cfg2 tuple
  TestValidator.equals(
    "namespace unchanged after failed update",
    safeUpdate.namespace,
    cfg2.namespace,
  );
  TestValidator.equals(
    "key unchanged after failed update",
    safeUpdate.key,
    cfg2.key,
  );
  TestValidator.equals(
    "environment unchanged after failed update",
    safeUpdate.environment,
    cfg2.environment ?? null,
  );
}
