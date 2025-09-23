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

export async function test_api_service_configuration_update_value_and_activation(
  connection: api.IConnection,
) {
  /**
   * Validate updating a configuration’s value, description, activation flag,
   * and effective window, ensuring updated_at increases and policy linkage
   * remains intact.
   *
   * Steps:
   *
   * 1. Join as systemAdmin (auth)
   * 2. Create a service policy
   * 3. Create a configuration under the policy
   * 4. Update configuration: value, description, active (toggle), effective window
   * 5. Validate fields, updated_at progression, and policy linkage
   */
  // 1) Authenticate as systemAdmin
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const authorized: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: adminJoinBody,
    });
  typia.assert(authorized);

  // 2) Create a service policy
  const now = new Date();
  const policyEffectiveFrom = new Date(
    now.getTime() - 60 * 60 * 1000,
  ).toISOString(); // 1h ago
  const policyEffectiveTo = new Date(
    now.getTime() + 24 * 60 * 60 * 1000,
  ).toISOString(); // +24h
  const policyBody = {
    namespace: `core-${RandomGenerator.alphabets(6)}`,
    code: `policy-${RandomGenerator.alphaNumeric(10)}`,
    name: `Policy ${RandomGenerator.name(1)}`,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    value: "true",
    value_type: "boolean",
    active: true,
    effective_from: policyEffectiveFrom,
    effective_to: policyEffectiveTo,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBody },
    );
  typia.assert(policy);

  // 3) Create a configuration under the policy
  const cfgEffectiveFrom1 = new Date(
    now.getTime() - 30 * 60 * 1000,
  ).toISOString(); // -30m
  const cfgEffectiveTo1 = new Date(
    now.getTime() + 2 * 60 * 60 * 1000,
  ).toISOString(); // +2h
  const cfgCreateBody = {
    // omit FK in body because it is scoped by path {policyId}
    namespace: `core-${RandomGenerator.alphabets(6)}`,
    environment: null,
    key: `feature-${RandomGenerator.alphaNumeric(8)}`,
    value: "off",
    value_type: "string",
    is_secret: false,
    description: RandomGenerator.paragraph({ sentences: 5 }),
    active: false,
    effective_from: cfgEffectiveFrom1,
    effective_to: cfgEffectiveTo1,
  } satisfies ITodoAppServiceConfiguration.ICreate;
  const created: ITodoAppServiceConfiguration =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.create(
      connection,
      {
        policyId: policy.id,
        body: cfgCreateBody,
      },
    );
  typia.assert(created);

  // After creation, configuration must be linked to the policy
  TestValidator.equals(
    "created config linked to policy",
    created.todo_app_service_policy_id,
    policy.id,
  );

  // 4) Update configuration (toggle active, change value/description, shift window)
  const cfgEffectiveFrom2 = new Date(
    now.getTime() + 2 * 60 * 60 * 1000,
  ).toISOString(); // +2h
  const cfgEffectiveTo2 = new Date(
    now.getTime() + 48 * 60 * 60 * 1000,
  ).toISOString(); // +48h
  // Sanity: coherent window
  TestValidator.predicate(
    "coherent updated effective window",
    new Date(cfgEffectiveFrom2).getTime() < new Date(cfgEffectiveTo2).getTime(),
  );
  const updateBody = {
    value: "on",
    description: RandomGenerator.paragraph({ sentences: 4 }),
    active: !created.active,
    effective_from: cfgEffectiveFrom2,
    effective_to: cfgEffectiveTo2,
  } satisfies ITodoAppServiceConfiguration.IUpdate;
  const updated: ITodoAppServiceConfiguration =
    await api.functional.todoApp.systemAdmin.serviceConfigurations.update(
      connection,
      {
        configurationId: created.id,
        body: updateBody,
      },
    );
  typia.assert(updated);

  // 5) Validate updates and invariants
  // id should remain identical
  TestValidator.equals("id remains stable", updated.id, created.id);
  // unchanged base fields
  TestValidator.equals(
    "namespace unchanged",
    updated.namespace,
    created.namespace,
  );
  TestValidator.equals("key unchanged", updated.key, created.key);
  TestValidator.equals(
    "environment unchanged",
    updated.environment,
    created.environment,
  );
  TestValidator.equals(
    "value_type unchanged",
    updated.value_type,
    created.value_type,
  );

  // updated fields
  TestValidator.equals("value updated to 'on'", updated.value, "on");
  TestValidator.equals(
    "description updated",
    updated.description,
    updateBody.description,
  );
  TestValidator.equals("active toggled", updated.active, !created.active);
  TestValidator.equals(
    "effective_from updated",
    updated.effective_from,
    cfgEffectiveFrom2,
  );
  TestValidator.equals(
    "effective_to updated",
    updated.effective_to,
    cfgEffectiveTo2,
  );

  // policy linkage remains intact
  TestValidator.equals(
    "policy linkage preserved",
    updated.todo_app_service_policy_id,
    policy.id,
  );

  // updated_at must be greater than before
  const tCreated = new Date(created.updated_at).getTime();
  const tUpdated = new Date(updated.updated_at).getTime();
  TestValidator.predicate(
    "updated_at increased after update",
    tUpdated > tCreated,
  );
}
