import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { IResult } from "@ORGANIZATION/PROJECT-api/lib/structures/IResult";
import type { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";
import type { ITodoMvpUserRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUserRefresh";

/**
 * Ensure a revoked user session cannot be refreshed.
 *
 * Steps:
 *
 * 1. Register a new user to obtain an access/refresh token bundle
 * 2. Revoke the current session with POST /my/auth/user/logout
 * 3. Attempt to POST /auth/user/refresh using the (now revoked) refresh token
 * 4. Expect the refresh attempt to be denied (authorization failure)
 *
 * Notes:
 *
 * - Do not validate specific HTTP status codes; only assert that an error occurs
 * - SDK auto-manages Authorization headers; this test does not touch headers
 */
export async function test_api_user_session_refresh_revoked_session_denied(
  connection: api.IConnection,
) {
  // 1) Register new user to obtain tokens
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12); // >= 8 chars

  const joined = await api.functional.auth.user.join(connection, {
    body: {
      email,
      password,
    } satisfies ITodoMvpUser.ICreate,
  });
  typia.assert(joined);

  const refreshToken: string = joined.token.refresh;

  // 2) Revoke current session
  const logoutResult = await api.functional.my.auth.user.logout(connection);
  typia.assert(logoutResult);
  TestValidator.predicate(
    "logout should return success true",
    logoutResult.success === true,
  );

  // 3) Attempt to refresh with revoked token -> must fail
  await TestValidator.error(
    "refresh with revoked session must be denied",
    async () => {
      await api.functional.auth.user.refresh(connection, {
        body: {
          refresh_token: refreshToken,
        } satisfies ITodoMvpUserRefresh.IRequest,
      });
    },
  );
}
