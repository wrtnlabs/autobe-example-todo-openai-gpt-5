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
 * Reject password change when current password is incorrect.
 *
 * Business goal: ensure that the system denies a password change request when
 * the provided current_password does not match the authenticated admin's
 * existing credential, and that no mutation occurs as a result.
 *
 * Steps:
 *
 * 1. Join/register a new system admin (auto-authenticated on success).
 * 2. Attempt to change password using a wrong current_password; expect error.
 * 3. Log in with the original password to confirm credentials unchanged and verify
 *    admin id consistency.
 * 4. Attempt login with the never-applied new password; expect failure.
 */
export async function test_api_system_admin_password_change_current_password_mismatch_rejected(
  connection: api.IConnection,
) {
  // 1) Register a new system admin (auto-attaches token to connection)
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const originalPassword: string = `${RandomGenerator.alphaNumeric(12)}!A1`; // >= 8 chars

  const joined: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email,
        password: originalPassword,
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(joined);

  // 2) Attempt password change with incorrect current password → expect error
  const wrongCurrentPassword: string = `${originalPassword}x`; // definitely wrong
  const newPassword: string = `${originalPassword}N3w!`;

  await TestValidator.error(
    "changePassword rejects when current_password mismatches",
    async () => {
      await api.functional.my.auth.systemAdmin.password.changePassword(
        connection,
        {
          body: {
            current_password: wrongCurrentPassword,
            new_password: newPassword,
          } satisfies ITodoAppSystemAdminPassword.IUpdate,
        },
      );
    },
  );

  // 3) Verify original password still works (no mutation occurred)
  const reLogin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.login(connection, {
      body: {
        email,
        password: originalPassword,
      } satisfies ITodoAppSystemAdminLogin.ICreate,
    });
  typia.assert(reLogin);

  // Business validation: same admin identity
  TestValidator.equals(
    "re-login id should match joined admin id after failed change",
    reLogin.id,
    joined.id,
  );

  // 4) Extra safety: the new password must not authenticate (since no change applied)
  await TestValidator.error(
    "login with never-applied new password must fail",
    async () => {
      await api.functional.auth.systemAdmin.login(connection, {
        body: {
          email,
          password: newPassword,
        } satisfies ITodoAppSystemAdminLogin.ICreate,
      });
    },
  );
}
