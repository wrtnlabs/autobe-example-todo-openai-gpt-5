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

/**
 * Validate system admin self-logout and idempotent session revocation.
 *
 * Steps
 *
 * 1. Register/authenticate as system admin (join) to obtain a session and token
 * 2. Call an admin-only protected endpoint to confirm access works pre-logout
 * 3. Call POST /my/auth/systemAdmin/logout to revoke the current session
 * 4. Confirm protected endpoint is rejected after logout
 * 5. Call logout again to validate idempotency and verify same session id
 */
export async function test_api_system_admin_logout_idempotent_session_revocation(
  connection: api.IConnection,
) {
  // 1) Register/authenticate as system admin
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const authorized = await api.functional.auth.systemAdmin.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);

  // 2) Access protected endpoint before logout (should succeed)
  const listBody = {
    page: 1,
    limit: 1,
  } satisfies ITodoAppServicePolicy.IRequest;
  const preLogoutPolicies =
    await api.functional.todoApp.systemAdmin.servicePolicies.index(connection, {
      body: listBody,
    });
  typia.assert(preLogoutPolicies);

  // 3) Logout current session
  const logoutBody = {
    reason: RandomGenerator.paragraph({ sentences: 6 }),
  } satisfies ITodoAppSystemAdminLogout.ICreate;
  const firstLogout = await api.functional.my.auth.systemAdmin.logout(
    connection,
    { body: logoutBody },
  );
  typia.assert(firstLogout);

  // 4) Protected endpoint must be rejected after logout
  await TestValidator.error(
    "protected admin endpoint should be rejected after logout",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.index(
        connection,
        { body: listBody },
      );
    },
  );

  // 5) Second logout should succeed idempotently
  const secondLogout = await api.functional.my.auth.systemAdmin.logout(
    connection,
    {
      body: {
        reason: RandomGenerator.paragraph({ sentences: 3 }),
      } satisfies ITodoAppSystemAdminLogout.ICreate,
    },
  );
  typia.assert(secondLogout);

  // Validate idempotency: same session id reported
  TestValidator.equals(
    "second logout refers to the same session id",
    secondLogout.session_id,
    firstLogout.session_id,
  );
}
