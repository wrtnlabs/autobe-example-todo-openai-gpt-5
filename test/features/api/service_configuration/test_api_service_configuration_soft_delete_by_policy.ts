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

export async function test_api_service_configuration_soft_delete_by_policy(
  connection: api.IConnection,
) {
  /**
   * Validate soft deletion of a service configuration under a parent policy and
   * exclusion from normal reads after deletion. Also verify admin-only access.
   *
   * Steps:
   *
   * 1. Unauthenticated access guard: attempt to create a policy without auth →
   *    error
   * 2. Admin join to obtain authorization
   * 3. Create a parent policy (capture policyId)
   * 4. Create a configuration under that policy (capture configurationId)
   * 5. Read configuration via scoped GET to confirm existence before delete
   * 6. Soft-delete configuration via scoped DELETE
   * 7. Verify GET now errors due to soft deletion (excluded by deleted_at)
   */

  // 1) Unauthenticated access guard: should fail
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  const unauthPolicyBody = {
    namespace: "authz",
    code: `POL_${RandomGenerator.alphaNumeric(10)}`,
    name: `Policy ${RandomGenerator.name(1)}`,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    value: RandomGenerator.paragraph({ sentences: 4 }),
    value_type: "string",
    active: true,
    effective_from: null,
    effective_to: null,
  } satisfies ITodoAppServicePolicy.ICreate;
  await TestValidator.error(
    "unauthenticated client cannot create service policy",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.create(
        unauthConn,
        { body: unauthPolicyBody },
      );
    },
  );

  // 2) Admin join
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: adminJoinBody,
    });
  typia.assert(admin);

  // 3) Create parent policy
  const createPolicyBody = {
    namespace: "core",
    code: `POL_${RandomGenerator.alphaNumeric(12)}`,
    name: `Core Policy ${RandomGenerator.name(1)}`,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    value: RandomGenerator.paragraph({ sentences: 5 }),
    value_type: "string",
    active: true,
    effective_from: null,
    effective_to: null,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: createPolicyBody },
    );
  typia.assert(policy);

  // 4) Create service configuration under policy
  const createConfigBody = {
    todo_app_service_policy_id: null, // path-scoped; explicitly null in body
    namespace: "core",
    environment: null,
    key: `cfg_${RandomGenerator.alphaNumeric(10)}`,
    value: RandomGenerator.alphabets(16),
    value_type: "string",
    is_secret: false,
    description: RandomGenerator.paragraph({ sentences: 5 }),
    active: true,
    effective_from: null,
    effective_to: null,
  } satisfies ITodoAppServiceConfiguration.ICreate;
  const config: ITodoAppServiceConfiguration =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.create(
      connection,
      {
        policyId: policy.id,
        body: createConfigBody,
      },
    );
  typia.assert(config);

  // 5) Read configuration pre-deletion
  const fetched: ITodoAppServiceConfiguration =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.at(
      connection,
      {
        policyId: policy.id,
        configurationId: config.id,
      },
    );
  typia.assert(fetched);
  TestValidator.equals(
    "fetched configuration id matches created id",
    fetched.id,
    config.id,
  );

  // 6) Soft-delete the configuration
  await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.erase(
    connection,
    {
      policyId: policy.id,
      configurationId: config.id,
    },
  );

  // 7) Verify configuration is excluded from normal reads (should error)
  await TestValidator.error(
    "soft-deleted configuration must be excluded from GET by id",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.at(
        connection,
        {
          policyId: policy.id,
          configurationId: config.id,
        },
      );
    },
  );
}
