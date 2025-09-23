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
import type { ITodoAppSystemAdminRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminRefresh";

export async function test_api_system_admin_registration_success_and_token_usability(
  connection: api.IConnection,
) {
  /**
   * Validate system admin registration, token usability, and refresh rotation.
   *
   * Steps:
   *
   * 1. Register a new system admin (join) and validate the authorized response and
   *    token structure/expirations.
   * 2. Call a protected admin endpoint (servicePolicies.index) using the access
   *    token implicitly set by the SDK to confirm immediate usability.
   * 3. Refresh with the returned refresh token, ensure rotation (new refresh
   *    differs), and validate new token timings.
   * 4. Call the protected admin endpoint again to confirm continued usability.
   */

  // 1) Prepare registration payload (unique email, strong password)
  const email = typia.random<string & tags.Format<"email">>();
  const password = typia.random<
    string & tags.MinLength<8> & tags.MaxLength<64>
  >();
  const joinBody = {
    email,
    password,
    ip: "127.0.0.1",
    user_agent: "E2E-Test/1.0",
  } satisfies ITodoAppSystemAdminJoin.ICreate;

  // 2) Join as system admin and validate response
  const authorized1: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized1);

  const token1: IAuthorizationToken = authorized1.token;
  typia.assert(token1);

  TestValidator.predicate(
    "access token (join) is non-empty",
    token1.access.length > 0,
  );
  TestValidator.predicate(
    "refresh token (join) is non-empty",
    token1.refresh.length > 0,
  );

  const nowMs1: number = Date.now();
  const accessExp1: number = new Date(token1.expired_at).getTime();
  const refreshableUntil1: number = new Date(
    token1.refreshable_until,
  ).getTime();
  TestValidator.predicate(
    "access token (join) expiry is in the future",
    accessExp1 > nowMs1,
  );
  TestValidator.predicate(
    "refresh token (join) refreshable_until is in the future",
    refreshableUntil1 > nowMs1,
  );

  // 3) Use the access token to call a protected admin endpoint
  const list1 = await api.functional.todoApp.systemAdmin.servicePolicies.index(
    connection,
    {
      body: {
        page: 1,
        limit: 5,
      } satisfies ITodoAppServicePolicy.IRequest,
    },
  );
  typia.assert(list1);

  // 4) Refresh tokens using the refresh token from join
  const refreshBody = {
    refresh_token: token1.refresh,
    ip: "127.0.0.1",
    user_agent: "E2E-Test/1.0",
  } satisfies ITodoAppSystemAdminRefresh.ICreate;

  const authorized2: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.refresh(connection, {
      body: refreshBody,
    });
  typia.assert(authorized2);

  const token2: IAuthorizationToken = authorized2.token;
  typia.assert(token2);

  TestValidator.predicate(
    "access token (refresh) is non-empty",
    token2.access.length > 0,
  );
  TestValidator.predicate(
    "refresh token (refresh) is non-empty",
    token2.refresh.length > 0,
  );

  const nowMs2: number = Date.now();
  const accessExp2: number = new Date(token2.expired_at).getTime();
  const refreshableUntil2: number = new Date(
    token2.refreshable_until,
  ).getTime();
  TestValidator.predicate(
    "access token (refresh) expiry is in the future",
    accessExp2 > nowMs2,
  );
  TestValidator.predicate(
    "refresh token (refresh) refreshable_until is in the future",
    refreshableUntil2 > nowMs2,
  );

  // Refresh token should rotate
  TestValidator.notEquals(
    "refresh token rotated after refresh",
    token2.refresh,
    token1.refresh,
  );

  // 5) Protected endpoint still usable after refresh
  const list2 = await api.functional.todoApp.systemAdmin.servicePolicies.index(
    connection,
    {
      body: {
        page: 1,
        limit: 5,
      } satisfies ITodoAppServicePolicy.IRequest,
    },
  );
  typia.assert(list2);
}
