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
 * Ensure unauthorized deletion of a service configuration is rejected.
 *
 * Business context:
 *
 * - Service policies and configurations are administrative resources requiring
 *   systemAdmin authorization.
 * - Deletion (erase) marks the configuration as deleted and must be denied to
 *   unauthenticated callers.
 *
 * Steps:
 *
 * 1. Authenticate as systemAdmin (join) to obtain a token (SDK auto-applies it on
 *    the connection).
 * 2. Create a service policy (admin-only endpoint).
 * 3. Create a configuration under that policy (admin-only endpoint).
 * 4. Attempt to delete the configuration using an unauthenticated connection
 *    (expect error via TestValidator.error).
 * 5. Cleanup by deleting the configuration with the authenticated connection (void
 *    response, just await it).
 */
export async function test_api_service_configuration_delete_unauthorized_access(
  connection: api.IConnection,
) {
  // 1) Admin join to obtain authenticated session
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert<ITodoAppSystemAdmin.IAuthorized>(admin);

  // 2) Create parent service policy
  const policy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: {
          namespace: "core",
          code: `pol_${RandomGenerator.alphaNumeric(12)}`,
          name: `Policy ${RandomGenerator.name(2)}`,
          description: RandomGenerator.paragraph({ sentences: 6 }),
          value: RandomGenerator.paragraph({ sentences: 3 }),
          value_type: "string",
          active: true,
        } satisfies ITodoAppServicePolicy.ICreate,
      },
    );
  typia.assert<ITodoAppServicePolicy>(policy);

  // 3) Create configuration under the policy
  const config =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.create(
      connection,
      {
        policyId: policy.id,
        body: {
          namespace: "auth",
          environment: "dev",
          key: `feature_${RandomGenerator.alphaNumeric(10)}`,
          value: "enabled",
          value_type: "string",
          is_secret: false,
          description: RandomGenerator.paragraph({ sentences: 4 }),
          active: true,
        } satisfies ITodoAppServiceConfiguration.ICreate,
      },
    );
  typia.assert<ITodoAppServiceConfiguration>(config);

  // Optional integrity check: linkage to parent policy if echoed
  if (
    config.todo_app_service_policy_id !== null &&
    config.todo_app_service_policy_id !== undefined
  )
    TestValidator.equals(
      "configuration should be linked to created policy",
      config.todo_app_service_policy_id,
      policy.id,
    );

  // 4) Attempt unauthorized deletion using an unauthenticated connection
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated access must be rejected when deleting configuration",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.erase(
        unauthConn,
        {
          policyId: policy.id,
          configurationId: config.id,
        },
      );
    },
  );

  // 5) Cleanup: perform authorized deletion to avoid residue
  await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.erase(
    connection,
    {
      policyId: policy.id,
      configurationId: config.id,
    },
  );
}
