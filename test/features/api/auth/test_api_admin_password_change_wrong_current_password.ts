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
 * Reject password change when the current password is incorrect, and verify the
 * existing authenticated session remains usable because no update was applied.
 *
 * Steps:
 *
 * 1. Register (join) an admin to obtain an authenticated session.
 * 2. Attempt to change password using a wrong current password and expect an
 *    error.
 * 3. Immediately change password with the correct current password and expect
 *    success, proving the previous failure did not invalidate the session.
 */
export async function test_api_admin_password_change_wrong_current_password(
  connection: api.IConnection,
) {
  // 1) Join as admin to authenticate and get a session
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // >= 8 chars
  } satisfies ITodoMvpAdminJoin.ICreate;

  const authorized = await api.functional.auth.admin.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);

  // 2) Negative case: wrong current password should be rejected
  const wrongAttemptBody = {
    current_password: joinBody.password + RandomGenerator.alphabets(1), // wrong on purpose
    new_password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoMvpAdminPassword.IUpdate;

  await TestValidator.error(
    "reject password change when current password is wrong",
    async () => {
      await api.functional.auth.admin.password.updatePassword(connection, {
        body: wrongAttemptBody,
      });
    },
  );

  // 3) Session continuity: valid password change should still succeed now
  const successBody = {
    current_password: joinBody.password,
    new_password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoMvpAdminPassword.IUpdate;

  const result: ITodoMvpAdminSecurityResult =
    await api.functional.auth.admin.password.updatePassword(connection, {
      body: successBody,
    });
  typia.assert(result);

  TestValidator.predicate(
    "password change succeeds with correct current password",
    result.success === true,
  );
}
