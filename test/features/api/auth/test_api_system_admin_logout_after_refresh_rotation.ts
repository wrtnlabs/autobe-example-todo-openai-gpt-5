import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppServicePolicy";
import type { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppSystemAdminLogout } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminLogout";
import type { ITodoAppSystemAdminLogoutResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminLogoutResult";
import type { ITodoAppSystemAdminRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminRefresh";

export async function test_api_system_admin_logout_after_refresh_rotation(
  connection: api.IConnection,
) {
  /**
   * Validate logout behavior after refresh rotation for systemAdmin.
   *
   * Steps:
   *
   * 1. Join as systemAdmin to obtain initial tokens.
   * 2. Refresh using the initial refresh token; ensure tokens rotate.
   * 3. Call a protected admin endpoint to confirm refreshed token validity.
   * 4. Logout via self-scoped endpoint to revoke the current session.
   * 5. Attempt the protected endpoint again; expect an authorization error.
   */
  // 1) Join as systemAdmin
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const joined: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, { body: joinBody });
  typia.assert(joined);

  // 2) Refresh using prior refresh token (rotate chain)
  const refreshBody = {
    refresh_token: joined.token.refresh,
  } satisfies ITodoAppSystemAdminRefresh.ICreate;
  const refreshed: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.refresh(connection, {
      body: refreshBody,
    });
  typia.assert(refreshed);

  // Validate rotation: new tokens should differ from initial tokens
  TestValidator.notEquals(
    "refresh token should be rotated after refresh",
    refreshed.token.refresh,
    joined.token.refresh,
  );
  TestValidator.notEquals(
    "access token should change after refresh",
    refreshed.token.access,
    joined.token.access,
  );

  // 3) Pre-logout protected call succeeds with refreshed access token
  const searchBody = {
    // all fields optional; empty filter body is valid
  } satisfies ITodoAppServicePolicy.IRequest;
  const prePage =
    await api.functional.todoApp.systemAdmin.servicePolicies.index(connection, {
      body: searchBody,
    });
  typia.assert(prePage);

  // 4) Logout current session
  const logoutBody = {
    reason: "E2E: logout after refresh rotation",
  } satisfies ITodoAppSystemAdminLogout.ICreate;
  const logoutResult: ITodoAppSystemAdminLogoutResult =
    await api.functional.my.auth.systemAdmin.logout(connection, {
      body: logoutBody,
    });
  typia.assert(logoutResult);

  // 5) Post-logout protected call using the same connection must fail
  await TestValidator.error(
    "protected admin endpoint must fail after logout",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.index(
        connection,
        {
          body: searchBody,
        },
      );
    },
  );
}
