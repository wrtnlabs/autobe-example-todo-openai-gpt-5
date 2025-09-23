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
 * Validate rejection on non-existent configurationId without leaking existence
 * details.
 *
 * Business flow and rationale:
 *
 * - The endpoint requires system administrator access, so authenticate first via
 *   join.
 * - Original scenario (malformed UUID) would be a type/format validation test,
 *   which is disallowed. Instead, we verify error behavior using a
 *   syntactically valid but non-existent UUID.
 * - We must not assert specific HTTP status codes or error messages; only confirm
 *   an error occurs.
 *
 * Steps:
 *
 * 1. Register a system admin account (join) and assert the authorization payload.
 * 2. Request a configuration detail with a random UUID expected not to exist;
 *    ensure the call errors.
 */
export async function test_api_service_configuration_detail_invalid_uuid_format_validation(
  connection: api.IConnection,
) {
  // 1) Authenticate as system administrator
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12), // satisfies MinLength<8> & MaxLength<64>
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert<ITodoAppSystemAdmin.IAuthorized>(admin);

  // 2) Attempt to fetch a configuration by a random UUID (presumed non-existent)
  const nonExistentId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();

  await TestValidator.error(
    "service configuration detail with random non-existent UUID must error",
    async () => {
      await api.functional.todoApp.systemAdmin.serviceConfigurations.at(
        connection,
        { configurationId: nonExistentId },
      );
    },
  );
}
