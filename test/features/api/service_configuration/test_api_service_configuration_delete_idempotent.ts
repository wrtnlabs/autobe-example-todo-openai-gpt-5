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
 * Validate idempotent deletion of a service configuration under a policy.
 *
 * Steps:
 *
 * 1. Admin joins (authentication established by SDK)
 * 2. Create a service policy (parent)
 * 3. Create a service configuration under the policy
 * 4. GET the configuration to verify existence and correct scoping
 * 5. DELETE the configuration once (should succeed)
 * 6. DELETE the configuration again (idempotent; should also succeed)
 * 7. GET should error after deletion (resource removed from active use)
 */
export async function test_api_service_configuration_delete_idempotent(
  connection: api.IConnection,
) {
  // 1) Admin join
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 2) Create parent policy
  const policy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: {
          namespace: RandomGenerator.name(1),
          code: `policy_${RandomGenerator.alphaNumeric(10)}`,
          name: RandomGenerator.paragraph({ sentences: 2 }),
          description: RandomGenerator.paragraph({ sentences: 5 }),
          value: "enabled",
          value_type: "string",
          active: true,
        } satisfies ITodoAppServicePolicy.ICreate,
      },
    );
  typia.assert(policy);

  // 3) Create configuration under the policy
  const valueType: EConfigValueType = "string";
  const created =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.create(
      connection,
      {
        policyId: policy.id,
        body: {
          namespace: policy.namespace,
          environment: null,
          key: `cfg_${RandomGenerator.alphaNumeric(8)}`,
          value: RandomGenerator.paragraph({ sentences: 3 }),
          value_type: valueType, // ICreate expects string; EConfigValueType is assignable
          is_secret: false,
          description: RandomGenerator.paragraph({ sentences: 4 }),
          active: true,
        } satisfies ITodoAppServiceConfiguration.ICreate,
      },
    );
  typia.assert(created);

  // 4) GET to verify existence before deletion
  const fetched =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.at(
      connection,
      {
        policyId: policy.id,
        configurationId: created.id,
      },
    );
  typia.assert(fetched);
  TestValidator.equals(
    "fetched configuration id matches created id before deletion",
    fetched.id,
    created.id,
  );

  // 5) First DELETE (should succeed)
  await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.erase(
    connection,
    {
      policyId: policy.id,
      configurationId: created.id,
    },
  );

  // 6) Second DELETE (idempotent; should also succeed)
  await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.erase(
    connection,
    {
      policyId: policy.id,
      configurationId: created.id,
    },
  );

  // 7) GET should error after deletion
  await TestValidator.error(
    "configuration should not be retrievable after deletion",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.at(
        connection,
        {
          policyId: policy.id,
          configurationId: created.id,
        },
      );
    },
  );
}
