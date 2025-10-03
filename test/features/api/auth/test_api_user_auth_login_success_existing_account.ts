import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";
import type { ITodoMvpUserLogin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUserLogin";

/**
 * Verify that an existing member can log in and receive a fresh token bundle.
 *
 * Steps:
 *
 * 1. Register (join) a member with unique email/password
 * 2. Login with the same credentials
 * 3. Validate both responses' structures
 * 4. Confirm identity consistency between join and login
 * 5. Ensure token rotation (access/refresh differ between join and login)
 * 6. On real backend (non-simulate), assert token expiry timestamps are in the
 *    future
 * 7. Check no sensitive info is leaked (covered by DTO shape and typia.assert)
 */
export async function test_api_user_auth_login_success_existing_account(
  connection: api.IConnection,
) {
  // Prepare unique credentials
  const email = typia.random<string & tags.Format<"email">>();
  const password = typia.random<string & tags.MinLength<8>>();

  // 1) Register (join)
  const joinBody = {
    email,
    password,
  } satisfies ITodoMvpUser.ICreate;
  const joined: ITodoMvpUser.IAuthorized = await api.functional.auth.user.join(
    connection,
    { body: joinBody },
  );
  typia.assert<ITodoMvpUser.IAuthorized>(joined);

  // 2) Login with the same credentials
  const loginBody = {
    email,
    password,
  } satisfies ITodoMvpUserLogin.IRequest;
  const loggedIn: ITodoMvpUser.IAuthorized =
    await api.functional.auth.user.login(connection, { body: loginBody });
  typia.assert<ITodoMvpUser.IAuthorized>(loggedIn);

  // 3) Identity consistency
  TestValidator.equals("login id equals join id", loggedIn.id, joined.id);
  TestValidator.equals(
    "login email equals join email",
    loggedIn.email,
    joined.email,
  );

  // If provider returns a sanitized user profile, verify it aligns with top-level identity
  if (loggedIn.user !== undefined) {
    typia.assert<ITodoMvpUser>(loggedIn.user);
    TestValidator.equals(
      "user.id matches authorized.id",
      loggedIn.user.id,
      loggedIn.id,
    );
    TestValidator.equals(
      "user.email matches authorized.email",
      loggedIn.user.email,
      loggedIn.email,
    );
  }

  // 4) Token rotation and content checks
  const jTok: IAuthorizationToken = joined.token;
  const lTok: IAuthorizationToken = loggedIn.token;
  typia.assert<IAuthorizationToken>(jTok);
  typia.assert<IAuthorizationToken>(lTok);

  TestValidator.notEquals(
    "access token should rotate on login",
    lTok.access,
    jTok.access,
  );
  TestValidator.notEquals(
    "refresh token should rotate on login",
    lTok.refresh,
    jTok.refresh,
  );

  TestValidator.predicate(
    "login access token is non-empty",
    typeof lTok.access === "string" && lTok.access.length > 0,
  );
  TestValidator.predicate(
    "login refresh token is non-empty",
    typeof lTok.refresh === "string" && lTok.refresh.length > 0,
  );

  // 5) Time window validations (skip in simulate mode)
  const isSimulate: boolean = !!connection.simulate;
  if (!isSimulate) {
    const now = Date.now();
    const accessExp = new Date(lTok.expired_at).getTime();
    const refreshUntil = new Date(lTok.refreshable_until).getTime();

    TestValidator.predicate(
      "access token expired_at is in the future",
      Number.isFinite(accessExp) && accessExp > now,
    );
    TestValidator.predicate(
      "refresh token refreshable_until is in the future",
      Number.isFinite(refreshUntil) && refreshUntil > now,
    );
  }
}
