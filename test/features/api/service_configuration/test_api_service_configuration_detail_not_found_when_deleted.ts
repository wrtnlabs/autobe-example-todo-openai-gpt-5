import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { EConfigValueType } from "@ORGANIZATION/PROJECT-api/lib/structures/EConfigValueType";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppServiceConfiguration } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServiceConfiguration";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Ensure logically deleted service configurations are not returned by detail
 * GET.
 *
 * Business context:
 *
 * - System administrators manage key/value configs (namespace/environment
 *   scoped).
 * - Soft-delete (deleted_at) excludes records from normal reads.
 *
 * Steps:
 *
 * 1. Join as system admin (auth token handled by SDK)
 * 2. Create a configuration
 * 3. Verify detail GET succeeds (id equality)
 * 4. Delete the configuration (logical delete)
 * 5. Verify detail GET now fails (error thrown)
 */
export async function test_api_service_configuration_detail_not_found_when_deleted(
  connection: api.IConnection,
) {
  // 1) Authenticate as system administrator
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
      ip: "127.0.0.1",
      user_agent: "e2e-test-agent",
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert<ITodoAppSystemAdmin.IAuthorized>(admin);

  // 2) Create a configuration (use value_type "string" for safe interpretation)
  const createBody = {
    todo_app_service_policy_id: null,
    namespace: `core-${RandomGenerator.alphabets(6)}`,
    environment: null,
    key: `key_${RandomGenerator.alphaNumeric(10)}`,
    value: RandomGenerator.paragraph({ sentences: 4 }),
    value_type: "string",
    is_secret: false,
    description: RandomGenerator.paragraph({ sentences: 3 }),
    active: true,
    effective_from: new Date().toISOString(),
    effective_to: null,
  } satisfies ITodoAppServiceConfiguration.ICreate;

  const created =
    await api.functional.todoApp.systemAdmin.serviceConfigurations.create(
      connection,
      { body: createBody },
    );
  typia.assert<ITodoAppServiceConfiguration>(created);

  // 3) Verify detail GET succeeds before deletion
  const beforeDelete =
    await api.functional.todoApp.systemAdmin.serviceConfigurations.at(
      connection,
      { configurationId: created.id },
    );
  typia.assert<ITodoAppServiceConfiguration>(beforeDelete);
  TestValidator.equals(
    "detail GET returns the same configuration id before deletion",
    beforeDelete.id,
    created.id,
  );

  // 4) Delete the configuration (logical deletion)
  await api.functional.todoApp.systemAdmin.serviceConfigurations.erase(
    connection,
    {
      configurationId: created.id,
    },
  );

  // 5) Verify detail GET fails after deletion (do not assert status code)
  await TestValidator.error(
    "deleted configuration should not be retrievable by detail endpoint",
    async () => {
      await api.functional.todoApp.systemAdmin.serviceConfigurations.at(
        connection,
        { configurationId: created.id },
      );
    },
  );
}
