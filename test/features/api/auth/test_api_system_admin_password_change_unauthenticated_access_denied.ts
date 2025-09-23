import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ITodoAppSystemAdminPassword } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminPassword";
import type { ITodoAppSystemAdminPasswordChangeResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminPasswordChangeResult";

/**
 * Ensure unauthenticated access is denied for system admin password change.
 *
 * Business rule: The /my/auth/systemAdmin/password endpoint requires an
 * authenticated system administrator. Requests without valid authentication
 * must be rejected and must not reveal sensitive implementation details. The
 * request body must still conform to the DTO contract even in negative tests.
 *
 * Steps:
 *
 * 1. Create an unauthenticated connection (empty headers).
 * 2. Prepare a valid password change payload
 *    (ITodoAppSystemAdminPassword.IUpdate).
 * 3. Attempt to change password using unauthenticated connection and expect an
 *    error.
 *
 * Notes:
 *
 * - Do not assert specific HTTP status codes; only assert that an error occurs.
 * - No side-effect validation is performed here because there is no authenticated
 *   context.
 */
export async function test_api_system_admin_password_change_unauthenticated_access_denied(
  connection: api.IConnection,
) {
  // 1) Create an unauthenticated connection (do not touch headers afterward)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 2) Prepare a valid request body matching password policy
  const body = {
    current_password: typia.random<
      string & tags.MinLength<8> & tags.MaxLength<64> & tags.Format<"password">
    >(),
    new_password: typia.random<
      string & tags.MinLength<8> & tags.MaxLength<64> & tags.Format<"password">
    >(),
  } satisfies ITodoAppSystemAdminPassword.IUpdate;

  // 3) Expect error on unauthenticated call (do not validate status code)
  await TestValidator.error(
    "unauthenticated system admin cannot change password",
    async () => {
      await api.functional.my.auth.systemAdmin.password.changePassword(
        unauthConn,
        { body },
      );
    },
  );
}
