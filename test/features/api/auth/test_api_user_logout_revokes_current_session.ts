import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { IResult } from "@ORGANIZATION/PROJECT-api/lib/structures/IResult";
import type { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";

/**
 * Verify that logging out revokes the current session token.
 *
 * Business goals:
 *
 * - Ensure that a newly joined user receives a valid session and can access a
 *   protected endpoint.
 * - Ensure that POST /my/auth/user/logout revokes the active session so the token
 *   can no longer be used.
 *
 * Test flow:
 *
 * 1. Register a new user via POST /auth/user/join to acquire an authenticated
 *    context.
 * 2. Call POST /my/auth/user/logout once to verify the token works (protected
 *    endpoint succeeds).
 * 3. Call POST /my/auth/user/logout again using the same token and expect an
 *    authorization failure.
 *
 *    - In simulation mode, skip step (3) because the simulator always returns
 *         randomized success.
 */
export async function test_api_user_logout_revokes_current_session(
  connection: api.IConnection,
) {
  // 1) Register a new user (join) to acquire an authenticated token context
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphabets(12), // >= 8 characters
  } satisfies ITodoMvpUser.ICreate;

  const authorized = await api.functional.auth.user.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);

  // 2) Call logout once to verify the token currently works (protected call succeeds)
  const first = await api.functional.my.auth.user.logout(connection);
  typia.assert(first);
  TestValidator.equals("first logout returns success", first.success, true);

  // 3) Attempt to call logout again with the same (now revoked) token
  //    Expect auth failure in real backend; simulator cannot model revocation.
  if (!connection.simulate) {
    await TestValidator.error(
      "second logout with revoked session should fail",
      async () => {
        await api.functional.my.auth.user.logout(connection);
      },
    );
  }
}
