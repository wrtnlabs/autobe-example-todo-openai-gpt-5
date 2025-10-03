import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";
import type { ITodoMvpUserLogin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUserLogin";

export async function test_api_user_auth_login_wrong_password_rejected(
  connection: api.IConnection,
) {
  /**
   * Validate that login fails with an incorrect password.
   *
   * Steps:
   *
   * 1. Create a real account via join (email + strong password).
   * 2. Build a fresh unauthenticated connection (allowed pattern) to avoid token
   *    side-effects set by join.
   * 3. Attempt login with the same email but wrong password — expect rejection.
   * 4. Attempt login with the correct password — expect success, validating the
   *    account works and avoiding false positives.
   *
   * Business validations:
   *
   * - Typia.assert on successful responses to guarantee structure.
   * - Email returned from join/login equals the input email.
   * - Wrong password path uses await TestValidator.error with async closure.
   */
  // 1) Prepare deterministic credentials and register the account
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const correctPassword = "CorrectPwd123"; // >= 8 chars
  const wrongPassword = "WrongPwd123"; // different from correct

  const joinBody = {
    email,
    password: correctPassword,
  } satisfies ITodoMvpUser.ICreate;

  const joined: ITodoMvpUser.IAuthorized = await api.functional.auth.user.join(
    connection,
    { body: joinBody },
  );
  typia.assert(joined);
  TestValidator.equals(
    "joined email should equal requested email",
    joined.email,
    joinBody.email,
  );

  // 2) Build a fresh unauthenticated connection (do not touch headers afterward)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 3) Wrong password attempt should be rejected
  await TestValidator.error(
    "login with wrong password should be rejected",
    async () => {
      await api.functional.auth.user.login(unauthConn, {
        body: {
          email,
          password: wrongPassword,
        } satisfies ITodoMvpUserLogin.IRequest,
      });
    },
  );

  // 4) Correct login should succeed
  const loggedIn: ITodoMvpUser.IAuthorized =
    await api.functional.auth.user.login(unauthConn, {
      body: {
        email,
        password: correctPassword,
      } satisfies ITodoMvpUserLogin.IRequest,
    });
  typia.assert(loggedIn);
  TestValidator.equals(
    "successful login email should equal requested email",
    loggedIn.email,
    email,
  );
}
