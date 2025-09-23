import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppSystemAdminLogin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminLogin";

export async function test_api_system_admin_login_invalid_password_failure(
  connection: api.IConnection,
) {
  /**
   * Validate that system admin login fails with an incorrect password and does
   * not leak sensitive details, and that a subsequent login with the correct
   * password succeeds.
   *
   * Steps:
   *
   * 1. Join a new system admin account (dependency)
   * 2. Create a fresh unauthenticated connection for negative testing
   * 3. Attempt login with incorrect password and expect an error
   * 4. Attempt login with correct password and validate success, ensuring admin id
   *    matches join result
   */
  // 1) Join a new system admin account
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const goodPassword: string & tags.MinLength<8> & tags.MaxLength<64> =
    typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>();

  const joined = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email,
      password: goodPassword,
      user_agent: `e2e/${RandomGenerator.name(1)}`,
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert<ITodoAppSystemAdmin.IAuthorized>(joined);

  // 2) Create a fresh unauthenticated connection (do not touch existing headers)
  const freshConn: api.IConnection = { ...connection, headers: {} };

  // Prepare an incorrect password that still satisfies constraints
  let badPassword: string & tags.MinLength<8> & tags.MaxLength<64> =
    typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>();
  if (badPassword === goodPassword) {
    // extremely unlikely, but ensure it's different
    badPassword = typia.random<
      string & tags.MinLength<8> & tags.MaxLength<64>
    >();
  }

  // 3) Negative path: attempt login with incorrect password, expect error
  await TestValidator.error(
    "login with incorrect password should fail",
    async () => {
      await api.functional.auth.systemAdmin.login(freshConn, {
        body: {
          email,
          password: badPassword,
          user_agent: `e2e/${RandomGenerator.name(1)}`,
        } satisfies ITodoAppSystemAdminLogin.ICreate,
      });
    },
  );

  // 4) Positive path: login with the correct password should succeed
  const loggedIn = await api.functional.auth.systemAdmin.login(freshConn, {
    body: {
      email,
      password: goodPassword,
      user_agent: `e2e/${RandomGenerator.name(1)}`,
    } satisfies ITodoAppSystemAdminLogin.ICreate,
  });
  typia.assert<ITodoAppSystemAdmin.IAuthorized>(loggedIn);

  // Verify that identity remains consistent between join and successful login
  TestValidator.equals(
    "authorized admin id must match id from join",
    loggedIn.id,
    joined.id,
  );
}
