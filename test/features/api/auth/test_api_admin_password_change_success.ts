import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { IEAdminStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAdminStatus";
import type { ITodoMvpAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdmin";
import type { ITodoMvpAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdminJoin";
import type { ITodoMvpAdminPassword } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdminPassword";
import type { ITodoMvpAdminSecurityResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdminSecurityResult";

/**
 * Validates successful admin password change and session behavior.
 *
 * Business flow:
 *
 * 1. Join a new admin account to obtain an authenticated session (token is set by
 *    SDK on the same connection).
 * 2. Change the password using PUT /auth/admin/password with current and new
 *    passwords.
 * 3. Validate ITodoMvpAdminSecurityResult response structure.
 * 4. Depending on security result:
 *
 *    - If reauth_required === false, current session remains valid: GET
 *         /todoMvp/admin/admins/{adminId} must succeed and match id.
 *    - If reauth_required === true, current session should not be usable until
 *         re-auth: protected GET should fail (assert error).
 *
 * Notes:
 *
 * - Use exact DTO variants and satisfies for request bodies.
 * - Never manipulate connection.headers in test (SDK handles tokens).
 * - No status code assertions; focus on business outcomes.
 */
export async function test_api_admin_password_change_success(
  connection: api.IConnection,
) {
  // 1) Admin join to establish authenticated context
  const email = typia.random<string & tags.Format<"email">>();
  const initialPassword = RandomGenerator.alphaNumeric(12); // >= 8 chars

  const joinBody = {
    email,
    password: initialPassword,
  } satisfies ITodoMvpAdminJoin.ICreate;

  const authorized = await api.functional.auth.admin.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);

  // 2) Change password with correct current password
  const newPassword = RandomGenerator.alphaNumeric(14);
  const updateBody = {
    current_password: initialPassword,
    new_password: newPassword,
  } satisfies ITodoMvpAdminPassword.IUpdate;

  const security = await api.functional.auth.admin.password.updatePassword(
    connection,
    { body: updateBody },
  );
  typia.assert(security);

  // 3) Verify session behavior with a protected read
  if (security.reauth_required === true) {
    // When re-authentication is required, current token usage should fail
    await TestValidator.error(
      "reauth required: protected admin detail access should fail",
      async () => {
        await api.functional.todoMvp.admin.admins.at(connection, {
          adminId: authorized.id,
        });
      },
    );
  } else {
    // Current session remains valid
    const detail = await api.functional.todoMvp.admin.admins.at(connection, {
      adminId: authorized.id,
    });
    typia.assert(detail);
    TestValidator.equals(
      "admin id from detail should match the joined admin id",
      detail.id,
      authorized.id,
    );
  }
}
