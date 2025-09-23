import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppSystemAdminLogin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminLogin";
import type { ITodoAppSystemAdminLogout } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminLogout";
import type { ITodoAppSystemAdminLogoutResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminLogoutResult";
import type { ITodoAppSystemAdminRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminRefresh";

/**
 * Verify refresh denial after session revocation for system admins.
 *
 * Business objective:
 *
 * - Prove that once an admin logs out (revoking the active session), the
 *   previously issued refresh token tied to that session can no longer be used
 *   to obtain new credentials.
 *
 * Steps:
 *
 * 1. Create an admin via join and ensure a valid identity exists
 * 2. Login to establish a fresh session and capture its refresh token (R1)
 * 3. Logout (self-scoped) to revoke the active session
 * 4. Attempt to refresh with R1 and expect an error
 */
export async function test_api_system_admin_refresh_denied_after_session_revocation(
  connection: api.IConnection,
) {
  // 1) Register a new system admin
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12);

  const joinBody = {
    email,
    password,
    ip: "127.0.0.1",
    user_agent: `e2e-join/${RandomGenerator.alphabets(6)}`,
  } satisfies ITodoAppSystemAdminJoin.ICreate;

  const joined: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: joinBody,
    });
  typia.assert(joined);

  // 2) Login to create a new session and receive a refresh token (R1)
  const loginBody = {
    email,
    password,
    ip: "127.0.0.1",
    user_agent: `e2e-login/${RandomGenerator.alphabets(6)}`,
  } satisfies ITodoAppSystemAdminLogin.ICreate;

  const loggedIn: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.login(connection, {
      body: loginBody,
    });
  typia.assert(loggedIn);

  // Sanity check: same admin identity
  TestValidator.equals("login id must match join id", loggedIn.id, joined.id);

  // Capture the refresh token from the login session
  const refreshTokenR1: string = loggedIn.token.refresh;
  TestValidator.predicate(
    "captured refresh token should be non-empty",
    refreshTokenR1.length > 0,
  );

  // 3) Self-logout to revoke the active session
  const logoutBody = {
    reason: RandomGenerator.paragraph({ sentences: 6 }),
  } satisfies ITodoAppSystemAdminLogout.ICreate;

  const logoutResult: ITodoAppSystemAdminLogoutResult =
    await api.functional.my.auth.systemAdmin.logout(connection, {
      body: logoutBody,
    });
  typia.assert(logoutResult);

  // 4) Attempt to refresh with the revoked session's refresh token -> expect failure
  await TestValidator.error(
    "refresh must be denied after session revocation",
    async () => {
      await api.functional.auth.systemAdmin.refresh(connection, {
        body: {
          refresh_token: refreshTokenR1,
          ip: "127.0.0.1",
          user_agent: `e2e-refresh/${RandomGenerator.alphabets(6)}`,
        } satisfies ITodoAppSystemAdminRefresh.ICreate,
      });
    },
  );
}
