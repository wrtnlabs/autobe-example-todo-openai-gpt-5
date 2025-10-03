import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";
import type { ITodoMvpUserPassword } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUserPassword";

/**
 * Verify that password change fails when the current password is incorrect.
 *
 * Business context:
 *
 * - A user registers via POST /auth/user/join, which also authenticates the
 *   session.
 * - The authenticated user attempts to change password via PUT
 *   /my/auth/user/password using ITodoMvpUserPassword.IUpdate.
 * - When current_password is wrong, the operation must fail without altering
 *   credentials.
 *
 * Steps:
 *
 * 1. Join a new user with a known password (establish authenticated session
 *    automatically)
 * 2. Attempt password change with incorrect current_password and a valid
 *    new_password
 * 3. Expect an error (business rule violation), without asserting specific HTTP
 *    status codes
 * 4. Sanity-check: joined response is valid and email matches the request
 */
export async function test_api_user_password_change_invalid_current_password(
  connection: api.IConnection,
) {
  // 1) Join a new user with known credentials
  const email = typia.random<string & tags.Format<"email">>();
  const password = RandomGenerator.alphaNumeric(12); // >= 8 characters

  const authorized = await api.functional.auth.user.join(connection, {
    body: {
      email,
      password,
    } satisfies ITodoMvpUser.ICreate,
  });
  typia.assert(authorized); // ITodoMvpUser.IAuthorized

  // Validate joined email matches input (actual-first order)
  TestValidator.equals(
    "joined user's email equals input",
    authorized.email,
    email,
  );

  // 2) Attempt to change password with incorrect current password
  const wrongCurrentPassword = `${password}X`; // guaranteed different, still >= 8 chars
  const newPassword = RandomGenerator.alphaNumeric(12);

  // 3) Expect an error from the API when current password verification fails
  await TestValidator.error(
    "password change fails with invalid current password",
    async () => {
      await api.functional.my.auth.user.password.updatePassword(connection, {
        body: {
          current_password: wrongCurrentPassword,
          new_password: newPassword,
        } satisfies ITodoMvpUserPassword.IUpdate,
      });
    },
  );
}
