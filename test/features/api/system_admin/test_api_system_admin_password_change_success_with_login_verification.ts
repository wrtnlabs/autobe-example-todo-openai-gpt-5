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
 * Change system admin password and verify login behavior.
 *
 * Workflow:
 *
 * 1. Create a system admin via join (captures initial email and old password).
 * 2. (Baseline) Login with the old password to ensure credentials work.
 * 3. While authenticated, call change-password with current_password=old and
 *    new_password=new.
 * 4. Try logging in with the old password again -> expect failure.
 * 5. Try logging in with the new password -> expect success and same admin id.
 *
 * Validations:
 *
 * - ChangePassword returns a valid ITodoAppSystemAdminPasswordChangeResult and
 *   success === true.
 * - Login with old password rejects after change.
 * - Login with new password succeeds and the admin id remains unchanged.
 */
export async function test_api_system_admin_password_change_success_with_login_verification(
  connection: api.IConnection,
) {
  // 1) Join: create a fresh admin and authenticated session
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const oldPassword: string = RandomGenerator.alphaNumeric(12); // 12 chars (>= 8)

  const joinAuthorized: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email,
        password: oldPassword,
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(joinAuthorized);

  // 2) Baseline: login with the old password (should succeed)
  const baselineLogin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.login(connection, {
      body: {
        email,
        password: oldPassword,
      } satisfies ITodoAppSystemAdminLogin.ICreate,
    });
  typia.assert(baselineLogin);

  // 3) Change password while authenticated
  const newPassword: string = RandomGenerator.alphaNumeric(14); // 14 chars (>= 8)
  const changeResult: ITodoAppSystemAdminPasswordChangeResult =
    await api.functional.my.auth.systemAdmin.password.changePassword(
      connection,
      {
        body: {
          current_password: oldPassword,
          new_password: newPassword,
        } satisfies ITodoAppSystemAdminPassword.IUpdate,
      },
    );
  typia.assert(changeResult);

  // Business validation: success must be true
  TestValidator.equals(
    "password change returns success === true",
    changeResult.success,
    true,
  );

  // 4) Attempt to login with the OLD password -> must fail
  await TestValidator.error(
    "login with old password should fail after change",
    async () => {
      await api.functional.auth.systemAdmin.login(connection, {
        body: {
          email,
          password: oldPassword,
        } satisfies ITodoAppSystemAdminLogin.ICreate,
      });
    },
  );

  // 5) Attempt to login with the NEW password -> must succeed
  const newLogin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.login(connection, {
      body: {
        email,
        password: newPassword,
      } satisfies ITodoAppSystemAdminLogin.ICreate,
    });
  typia.assert(newLogin);

  // Admin id should remain unchanged
  TestValidator.equals(
    "admin id should remain the same after password change",
    newLogin.id,
    joinAuthorized.id,
  );
}
