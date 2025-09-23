import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppSystemAdminLogin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminLogin";
import type { ITodoAppSystemAdminPassword } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminPassword";
import type { ITodoAppSystemAdminPasswordChangeResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminPasswordChangeResult";

/**
 * Validate rejection of weak new password during admin self password change.
 *
 * Business context:
 *
 * - A system administrator who is already authenticated attempts to change their
 *   own password.
 * - Password policy requires 8–64 characters (and possibly composition rules).
 * - When the new password violates policy (e.g., too short), the operation must
 *   fail and no credential update should occur.
 *
 * Steps:
 *
 * 1. Register a new system admin via /auth/systemAdmin/join with a valid password
 *    to obtain an authenticated context (SDK auto-applies token).
 * 2. Attempt to change password via /my/auth/systemAdmin/password providing the
 *    correct current_password but a weak new_password (shorter than 8 chars).
 *    Expect failure (use TestValidator.error without asserting specific
 *    status).
 * 3. Verify that the original credential still works by logging in again with the
 *    same email/password. Confirm the same admin id is returned.
 */
export async function test_api_system_admin_password_change_weak_new_password_validation_error(
  connection: api.IConnection,
) {
  // Prepare credentials
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const initialPassword: string = RandomGenerator.alphaNumeric(12);
  const weakNewPassword: string = RandomGenerator.alphaNumeric(6); // violates MinLength<8>

  // 1) Register admin (auto-authenticates via SDK)
  const joined: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email,
        password: initialPassword,
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(joined);

  // 2) Attempt to change to a weak new password → expect validation failure
  await TestValidator.error(
    "changing to a weak new password must fail",
    async () => {
      await api.functional.my.auth.systemAdmin.password.changePassword(
        connection,
        {
          body: {
            current_password: initialPassword,
            new_password: weakNewPassword, // too short
          } satisfies ITodoAppSystemAdminPassword.IUpdate,
        },
      );
    },
  );

  // 3) Original credential must still work
  const reAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.login(connection, {
      body: {
        email,
        password: initialPassword,
      } satisfies ITodoAppSystemAdminLogin.ICreate,
    });
  typia.assert(reAuth);

  // Same admin id ensures identity is unchanged
  TestValidator.equals(
    "re-login returns the same admin id after failed password change",
    reAuth.id,
    joined.id,
  );
}
