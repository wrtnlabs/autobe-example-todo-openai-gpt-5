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
 * Log out the current admin session and verify refresh revocation.
 *
 * Workflow:
 *
 * 1. Register and authenticate a new admin via /auth/admin/join to obtain an
 *    access/refresh token bundle. Persist the original refresh token.
 * 2. Call /auth/admin/logout to revoke the current session.
 * 3. Attempt /auth/admin/refresh using the pre-logout refresh token and expect
 *    failure, confirming revocation enforcement.
 *
 * Notes:
 *
 * - Do not test status codes; only assert that an error occurs on refresh.
 * - Do not manipulate connection.headers; SDK handles Authorization token.
 * - Use strict typing: request bodies via `satisfies`, responses via
 *   typia.assert.
 */
export async function test_api_admin_logout_current_session(
  connection: api.IConnection,
) {
  // 1) Register and authenticate a new admin; capture the initial refresh token
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8>>(),
  } satisfies ITodoMvpAdminJoin.ICreate;

  const authorized: ITodoMvpAdmin.IAuthorized =
    await api.functional.auth.admin.join(connection, { body: joinBody });
  typia.assert(authorized);

  const preLogoutRefresh: string = authorized.token.refresh;

  // 2) Logout current session (void response)
  await api.functional.auth.admin.logout(connection);

  // 3) Refresh with the pre-logout token must fail
  await TestValidator.error(
    "refresh with revoked session should fail",
    async () => {
      await api.functional.auth.admin.refresh(connection, {
        body: {
          refresh_token: preLogoutRefresh,
        } satisfies ITodoMvpAdminRefresh.ICreate,
      });
    },
  );
}
