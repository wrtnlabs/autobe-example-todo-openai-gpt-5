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
import type { ITodoAppSystemAdminLogin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminLogin";

/**
 * Authenticate a system administrator and validate token usability.
 *
 * Flow
 *
 * 1. Join: create an admin account using POST /auth/systemAdmin/join.
 * 2. Login: use a fresh unauthenticated connection and POST
 *    /auth/systemAdmin/login with the same credentials.
 * 3. Validate tokens: ensure access/refresh are non-empty, and expiration
 *    timestamps are in the future with coherent ordering.
 * 4. Authorization check: call PATCH /todoApp/systemAdmin/servicePolicies with
 *    minimal request to ensure the access token authorizes admin-only
 *    resources.
 */
export async function test_api_system_admin_login_success_with_valid_credentials(
  connection: api.IConnection,
) {
  // 1) Join: create an admin account
  const email = typia.random<string & tags.Format<"email">>();
  const password = typia.random<
    string & tags.MinLength<8> & tags.MaxLength<64>
  >();
  const joinBody = {
    email,
    password,
    user_agent: `NestiaE2E/${RandomGenerator.alphaNumeric(8)}`,
  } satisfies ITodoAppSystemAdminJoin.ICreate;

  const joined: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: joinBody,
    });
  typia.assert(joined);

  // 2) Login with a fresh unauthenticated connection (SDK will attach token)
  const freshConn: api.IConnection = { ...connection, headers: {} };
  const loginBody = {
    email,
    password,
    user_agent: `NestiaE2E/${RandomGenerator.alphaNumeric(8)}`,
  } satisfies ITodoAppSystemAdminLogin.ICreate;

  const loggedIn: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.login(freshConn, { body: loginBody });
  typia.assert(loggedIn);

  // 3) Validate tokens are non-empty and expiration metadata is future-oriented
  const token: IAuthorizationToken = loggedIn.token;
  TestValidator.predicate("access token is non-empty", token.access.length > 0);
  TestValidator.predicate(
    "refresh token is non-empty",
    token.refresh.length > 0,
  );

  const now = Date.now();
  const accessExp = new Date(token.expired_at).getTime();
  const refreshUntil = new Date(token.refreshable_until).getTime();
  TestValidator.predicate(
    "access token expiry is in the future",
    accessExp > now,
  );
  TestValidator.predicate(
    "refresh token window is in the future",
    refreshUntil > now,
  );
  TestValidator.predicate(
    "refreshable_until is not earlier than access expiry",
    refreshUntil >= accessExp,
  );

  // 4) Use the post-login connection to access an admin-only endpoint
  const page: IPageITodoAppServicePolicy.ISummary =
    await api.functional.todoApp.systemAdmin.servicePolicies.index(freshConn, {
      body: {} satisfies ITodoAppServicePolicy.IRequest,
    });
  typia.assert(page);

  // Basic sanity checks on pagination structure (business-level, beyond type)
  TestValidator.predicate(
    "pagination current is non-negative",
    page.pagination.current >= 0,
  );
  TestValidator.predicate(
    "pagination limit is non-negative",
    page.pagination.limit >= 0,
  );
}
