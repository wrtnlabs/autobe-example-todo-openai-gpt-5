import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { IEAdminStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAdminStatus";
import type { ITodoMvpAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdmin";
import type { ITodoMvpAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdminJoin";
import type { ITodoMvpAdminLogin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdminLogin";

/**
 * Verify admin login fails with wrong password, then succeeds with correct one.
 *
 * Steps:
 *
 * 1. Register a new admin via POST /auth/admin/join with a random email and a
 *    valid password (>= 8 chars).
 * 2. On a fresh unauthenticated connection (headers: {}), call POST
 *    /auth/admin/login with the same email but wrong password and expect an
 *    error.
 * 3. On the same fresh connection, call POST /auth/admin/login with the correct
 *    password and expect success.
 * 4. Validate that the successful login's identity (id/email) matches the
 *    initially created admin.
 *
 * Notes:
 *
 * - Use typia.assert on non-void responses.
 * - Do not validate HTTP status codes or error messages.
 * - Do not read/modify connection.headers beyond creating a fresh connection with
 *   empty headers.
 */
export async function test_api_admin_login_wrong_password(
  connection: api.IConnection,
) {
  // 1) Register a new admin
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12);

  const joinBody = {
    email,
    password,
  } satisfies ITodoMvpAdminJoin.ICreate;

  const joined = await api.functional.auth.admin.join(connection, {
    body: joinBody,
  });
  typia.assert(joined);

  // 2) Attempt login with a wrong password using a fresh unauthenticated connection
  const fresh: api.IConnection = { ...connection, headers: {} };

  const wrongLoginBody = {
    email,
    password: `${password}x`,
  } satisfies ITodoMvpAdminLogin.ICreate;

  await TestValidator.error(
    "admin login should fail with incorrect password",
    async () => {
      await api.functional.auth.admin.login(fresh, {
        body: wrongLoginBody,
      });
    },
  );

  // 3) Now login with the correct password on the same fresh connection
  const correctLoginBody = {
    email,
    password,
  } satisfies ITodoMvpAdminLogin.ICreate;

  const loggedIn = await api.functional.auth.admin.login(fresh, {
    body: correctLoginBody,
  });
  typia.assert(loggedIn);

  // 4) Business validations - ensure the same identity
  TestValidator.equals(
    "login returns same admin id as initially created",
    loggedIn.id,
    joined.id,
  );
  TestValidator.equals(
    "login returns same email as initially created",
    loggedIn.email,
    joined.email,
  );
}
