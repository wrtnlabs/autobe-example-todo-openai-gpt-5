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
 * Verify admin token refresh rotates tokens and keeps identity consistent.
 *
 * Business workflow:
 *
 * 1. Register a new admin via POST /auth/admin/join and obtain initial tokens.
 * 2. Call POST /auth/admin/refresh with the original refresh token.
 * 3. Validate identity stability (id/email unchanged) and token rotation
 *    (access/refresh changed).
 * 4. Ensure expiry-related fields do not move backward: new expired_at and
 *    refreshable_until are greater-than-or-equal to previous values.
 * 5. Attempt to reuse the old refresh token; expect failure (error thrown).
 */
export async function test_api_admin_refresh_success(
  connection: api.IConnection,
) {
  // 1) Join: create an admin and obtain initial authorization bundle
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8>>(),
  } satisfies ITodoMvpAdminJoin.ICreate;
  const authorized1: ITodoMvpAdmin.IAuthorized =
    await api.functional.auth.admin.join(connection, { body: joinBody });
  typia.assert(authorized1);

  const oldAccess: string = authorized1.token.access;
  const oldRefresh: string = authorized1.token.refresh;
  const oldAccessExpTs: number = Date.parse(authorized1.token.expired_at);
  const oldRefreshableTs: number = Date.parse(
    authorized1.token.refreshable_until,
  );

  // 2) Refresh using the captured refresh token
  const refreshBody1 = {
    refresh_token: oldRefresh,
  } satisfies ITodoMvpAdminRefresh.ICreate;
  const authorized2: ITodoMvpAdmin.IAuthorized =
    await api.functional.auth.admin.refresh(connection, { body: refreshBody1 });
  typia.assert(authorized2);

  // 3) Identity remains the same
  TestValidator.equals(
    "same admin id after refresh",
    authorized2.id,
    authorized1.id,
  );
  TestValidator.equals(
    "same admin email after refresh",
    authorized2.email,
    authorized1.email,
  );

  // 4) Token rotation and non-decreasing expirations
  TestValidator.notEquals(
    "access token should rotate",
    authorized2.token.access,
    oldAccess,
  );
  TestValidator.notEquals(
    "refresh token should rotate",
    authorized2.token.refresh,
    oldRefresh,
  );

  const newAccessExpTs: number = Date.parse(authorized2.token.expired_at);
  const newRefreshableTs: number = Date.parse(
    authorized2.token.refreshable_until,
  );
  TestValidator.predicate(
    "access token expiry should not decrease",
    newAccessExpTs >= oldAccessExpTs,
  );
  TestValidator.predicate(
    "refreshable_until should not decrease",
    newRefreshableTs >= oldRefreshableTs,
  );

  // 5) Reusing the OLD refresh token must fail
  await TestValidator.error(
    "reusing old refresh token should fail",
    async () => {
      const bodyOld = {
        refresh_token: oldRefresh,
      } satisfies ITodoMvpAdminRefresh.ICreate;
      await api.functional.auth.admin.refresh(connection, { body: bodyOld });
    },
  );
}
