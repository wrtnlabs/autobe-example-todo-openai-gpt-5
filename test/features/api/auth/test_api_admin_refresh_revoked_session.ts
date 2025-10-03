import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { IEAdminStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAdminStatus";
import type { ITodoMvpAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdmin";
import type { ITodoMvpAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdminJoin";
import type { ITodoMvpAdminRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdminRefresh";

/**
 * Ensure admin refresh is rejected after session logout.
 *
 * Business goal:
 *
 * - Verify that once an admin explicitly logs out, attempting to refresh the
 *   revoked session fails to prevent token replay or renewal.
 *
 * Steps:
 *
 * 1. Join an admin to obtain initial access/refresh tokens (join).
 * 2. Revoke current session via logout.
 * 3. Attempt to refresh using the original refresh token from step 1.
 * 4. Assert that refresh fails (error is thrown).
 *
 * Notes:
 *
 * - Do not inspect or modify connection.headers; the SDK manages tokens.
 * - Do not check specific HTTP status codes; only assert that an error occurs.
 */
export async function test_api_admin_refresh_revoked_session(
  connection: api.IConnection,
) {
  // 1) Register a new admin and obtain tokens
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoMvpAdminJoin.ICreate;

  const authorized = await api.functional.auth.admin.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);

  // Preserve the refresh token from the joined session
  const refreshToken: string = authorized.token.refresh;

  // 2) Logout to revoke the current session
  await api.functional.auth.admin.logout(connection);

  // 3) Try to refresh with the revoked session's refresh token
  await TestValidator.error(
    "refresh must fail after logout revokes the session",
    async () => {
      await api.functional.auth.admin.refresh(connection, {
        body: {
          refresh_token: refreshToken,
        } satisfies ITodoMvpAdminRefresh.ICreate,
      });
    },
  );
}
