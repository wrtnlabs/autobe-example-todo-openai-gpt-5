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
 * Validate cross-policy isolation on configuration deletion (not-found on
 * mismatch).
 *
 * Scenario:
 *
 * 1. Admin joins (auth token set automatically by SDK).
 * 2. Create Policy A and Policy B.
 * 3. Under Policy A, create a configuration (configurationId_A).
 * 4. Attempt DELETE with Policy B and configurationId_A -> expect error (not
 *    found), no leakage.
 * 5. Cleanup: DELETE with the correct policy (A) should succeed.
 */
export async function test_api_service_configuration_delete_cross_policy_mismatch_not_found(
  connection: api.IConnection,
) {
  // 1) Admin join (authorization context)
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: typia.random<ITodoAppSystemAdminJoin.ICreate>(),
    });
  typia.assert(adminAuth);

  // Helper to pick a valid value_type literal
  const valueTypes = [
    "string",
    "int",
    "double",
    "boolean",
    "datetime",
    "uri",
  ] as const satisfies readonly EConfigValueType[];
  const pickValueType = (): EConfigValueType =>
    RandomGenerator.pick(valueTypes);

  // 2) Create Policy A
  const policyABody = {
    namespace: "core",
    code: `polA_${RandomGenerator.alphaNumeric(10)}`,
    name: `Policy A ${RandomGenerator.alphaNumeric(6)}`,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    value: "enabled",
    value_type: "string",
    active: true,
    effective_from: null,
    effective_to: null,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policyA: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: policyABody,
      },
    );
  typia.assert(policyA);

  // 2) Create Policy B
  const policyBBody = {
    namespace: "core",
    code: `polB_${RandomGenerator.alphaNumeric(10)}`,
    name: `Policy B ${RandomGenerator.alphaNumeric(6)}`,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    value: "enabled",
    value_type: "string",
    active: true,
    effective_from: null,
    effective_to: null,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policyB: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: policyBBody,
      },
    );
  typia.assert(policyB);

  // Sanity: A and B have different IDs
  TestValidator.notEquals(
    "policy A and B must be distinct",
    policyA.id,
    policyB.id,
  );

  // 3) Create configuration under Policy A
  const configCreateBody = {
    todo_app_service_policy_id: null, // path-scoped to policy A
    namespace: "core",
    environment: null,
    key: `feature_${RandomGenerator.alphaNumeric(8)}`,
    value: "on",
    value_type: pickValueType(),
    is_secret: false,
    description: RandomGenerator.paragraph({ sentences: 5 }),
    active: true,
    effective_from: null,
    effective_to: null,
  } satisfies ITodoAppServiceConfiguration.ICreate;
  const configA: ITodoAppServiceConfiguration =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.create(
      connection,
      {
        policyId: policyA.id,
        body: configCreateBody,
      },
    );
  typia.assert(configA);

  // 4) Attempt DELETE with Policy B using configuration from Policy A → expect error (not found)
  await TestValidator.error(
    "cross-policy delete must fail (isolation: not found)",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.erase(
        connection,
        {
          policyId: policyB.id,
          configurationId: configA.id,
        },
      );
    },
  );

  // 5) Cleanup: DELETE with correct policy (A) should succeed
  await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.erase(
    connection,
    {
      policyId: policyA.id,
      configurationId: configA.id,
    },
  );
}
