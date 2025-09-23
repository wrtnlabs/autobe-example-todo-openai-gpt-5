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

export async function test_api_service_configuration_update_under_policy(
  connection: api.IConnection,
) {
  /**
   * E2E: Update an existing configuration under its policy.
   *
   * Steps:
   *
   * 1. Authenticate as systemAdmin (join) → token managed by SDK
   * 2. Create a service policy; capture policy.id
   * 3. Create a configuration under that policy; capture configuration.id
   * 4. Update the configuration via PUT with changes to
   *    value/value_type/is_secret/active and set a coherent effectivity window
   *    (effective_from < effective_to)
   * 5. Validate: type correctness, association to policy, field updates,
   *    updated_at changed, and effective window coherence
   */

  // 1) Authenticate as systemAdmin
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
        user_agent: "e2e-test",
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(admin);

  // 2) Create a parent service policy
  const policyBody = {
    namespace: "auth",
    code: `policy_${RandomGenerator.alphaNumeric(10)}`,
    name: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.paragraph({ sentences: 8 }),
    value: "true",
    value_type: "boolean",
    active: true,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBody },
    );
  typia.assert(policy);

  // 3) Create a configuration under that policy
  const configCreateBody = {
    namespace: "auth",
    environment: "prod",
    key: `max_login_attempts_${RandomGenerator.alphaNumeric(6)}`,
    value: "5",
    value_type: "int",
    is_secret: false,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    active: true,
  } satisfies ITodoAppServiceConfiguration.ICreate;
  const created: ITodoAppServiceConfiguration =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.create(
      connection,
      {
        policyId: policy.id,
        body: configCreateBody,
      },
    );
  typia.assert(created);

  // Prepare update values
  const effectiveFrom: string = new Date(Date.now() + 60 * 1000).toISOString(); // +1 min
  const effectiveTo: string = new Date(
    Date.now() + 24 * 60 * 60 * 1000,
  ).toISOString(); // +1 day
  const desiredType: EConfigValueType = "int";
  const updateBody = {
    value: "10",
    value_type: desiredType,
    is_secret: true,
    active: false,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    description: RandomGenerator.paragraph({ sentences: 5 }),
  } satisfies ITodoAppServiceConfiguration.IUpdate;

  // 4) Update the configuration under the same policy
  const updated: ITodoAppServiceConfiguration =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.update(
      connection,
      {
        policyId: policy.id,
        configurationId: created.id,
        body: updateBody,
      },
    );
  typia.assert(updated);

  // 5) Validations
  if (connection.simulate !== true) {
    // Association remains under the same policy
    const createdPolicyId = typia.assert<string & tags.Format<"uuid">>(
      created.todo_app_service_policy_id!,
    );
    TestValidator.equals(
      "created configuration linked to the policy",
      createdPolicyId,
      policy.id,
    );

    const updatedPolicyId = typia.assert<string & tags.Format<"uuid">>(
      updated.todo_app_service_policy_id!,
    );
    TestValidator.equals(
      "updated configuration remains under same policy",
      updatedPolicyId,
      policy.id,
    );

    // updated_at changed after update
    TestValidator.notEquals(
      "updated_at should change after update",
      updated.updated_at,
      created.updated_at,
    );

    // Field reflections
    TestValidator.equals(
      "value updated correctly",
      updated.value,
      updateBody.value,
    );
    TestValidator.equals(
      "value_type updated/persisted correctly",
      updated.value_type,
      desiredType,
    );
    TestValidator.equals("is_secret set to true", updated.is_secret, true);
    TestValidator.equals("active toggled to false", updated.active, false);

    // Effective window coherence (from < to)
    const uf = typia.assert<string & tags.Format<"date-time">>(
      updated.effective_from!,
    );
    const ut = typia.assert<string & tags.Format<"date-time">>(
      updated.effective_to!,
    );
    TestValidator.predicate(
      "effective_from precedes effective_to",
      new Date(uf).getTime() < new Date(ut).getTime(),
    );
  }
}
