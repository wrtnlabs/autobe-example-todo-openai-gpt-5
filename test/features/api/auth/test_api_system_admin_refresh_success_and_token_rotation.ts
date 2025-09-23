import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppSystemAdminLogin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminLogin";
import type { ITodoAppSystemAdminRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminRefresh";

/**
 * Verify system admin refresh flow performs secure token rotation.
 *
 * This test performs a full authentication journey and validates refresh-token
 * rotation semantics for the system administrator role.
 *
 * Steps:
 *
 * 1. Register admin via join to create the identity.
 * 2. Login to obtain initial access/refresh token pair (R1/A1).
 * 3. Refresh with R1 → receive new credentials (R2/A2) and ensure rotation:
 *
 *    - New refresh token (R2) differs from R1
 *    - Access token likely changes (A2 != A1)
 *    - Expiration timestamps are in the future
 *    - Admin id remains consistent across steps
 * 4. Attempt to refresh again with R1 → expect failure (cannot reuse rotated
 *    token).
 * 5. Optional: Refresh with R2 to get R3 and confirm continued rotation, then
 *    verify R2 cannot be reused either.
 */
export async function test_api_system_admin_refresh_success_and_token_rotation(
  connection: api.IConnection,
) {
  // Prepare admin credentials
  const email = typia.random<string & tags.Format<"email">>();
  const password = RandomGenerator.alphaNumeric(12);
  const ip = "127.0.0.1";
  const userAgent = "e2e/system-admin-refresh";

  // 1) Join - create system admin account
  const joined = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email,
      password,
      ip,
      user_agent: userAgent,
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert<ITodoAppSystemAdmin.IAuthorized>(joined);

  // 2) Login - obtain initial tokens (R1/A1)
  const loggedIn = await api.functional.auth.systemAdmin.login(connection, {
    body: {
      email,
      password,
      ip,
      user_agent: userAgent,
    } satisfies ITodoAppSystemAdminLogin.ICreate,
  });
  typia.assert<ITodoAppSystemAdmin.IAuthorized>(loggedIn);
  TestValidator.equals(
    "admin id consistent between join and login",
    loggedIn.id,
    joined.id,
  );

  const R1 = loggedIn.token.refresh;
  const A1 = loggedIn.token.access;

  // 3) Refresh with R1 → expect rotation to R2/A2
  const refreshed1 = await api.functional.auth.systemAdmin.refresh(connection, {
    body: {
      refresh_token: R1,
      ip,
      user_agent: userAgent,
    } satisfies ITodoAppSystemAdminRefresh.ICreate,
  });
  typia.assert<ITodoAppSystemAdmin.IAuthorized>(refreshed1);

  // Identity must be preserved
  TestValidator.equals(
    "admin id preserved after first refresh",
    refreshed1.id,
    loggedIn.id,
  );

  // Rotation: new refresh token differs from previous
  TestValidator.notEquals(
    "refresh token rotated (R2 differs from R1)",
    refreshed1.token.refresh,
    R1,
  );

  // Access token should also rotate in most implementations
  TestValidator.notEquals(
    "access token rotated (A2 differs from A1)",
    refreshed1.token.access,
    A1,
  );

  // Expiration timestamps must be in the future
  const now = Date.now();
  TestValidator.predicate(
    "access token expiration is in the future",
    Date.parse(refreshed1.token.expired_at) > now,
  );
  TestValidator.predicate(
    "refresh token refreshable_until is in the future",
    Date.parse(refreshed1.token.refreshable_until) > now,
  );

  const R2 = refreshed1.token.refresh;

  // 4) Reuse of R1 must fail
  await TestValidator.error("reusing rotated R1 must fail", async () => {
    await api.functional.auth.systemAdmin.refresh(connection, {
      body: { refresh_token: R1 } satisfies ITodoAppSystemAdminRefresh.ICreate,
    });
  });

  // 5) Optional: rotate again with R2 to get R3 and validate further
  const refreshed2 = await api.functional.auth.systemAdmin.refresh(connection, {
    body: {
      refresh_token: R2,
      ip,
      user_agent: userAgent,
    } satisfies ITodoAppSystemAdminRefresh.ICreate,
  });
  typia.assert<ITodoAppSystemAdmin.IAuthorized>(refreshed2);
  TestValidator.equals(
    "admin id preserved after second refresh",
    refreshed2.id,
    joined.id,
  );
  TestValidator.notEquals(
    "refresh token rotated again (R3 differs from R2)",
    refreshed2.token.refresh,
    R2,
  );
  TestValidator.predicate(
    "second refresh access expiry is in the future",
    Date.parse(refreshed2.token.expired_at) > now,
  );
  TestValidator.predicate(
    "second refresh refreshable_until is in the future",
    Date.parse(refreshed2.token.refreshable_until) > now,
  );

  const R3 = refreshed2.token.refresh;

  // Reusing R2 should now fail after successful rotation to R3
  await TestValidator.error("reusing rotated R2 must fail", async () => {
    await api.functional.auth.systemAdmin.refresh(connection, {
      body: { refresh_token: R2 } satisfies ITodoAppSystemAdminRefresh.ICreate,
    });
  });

  // Sanity: R3 should differ from both R1 and R2
  TestValidator.notEquals("R3 differs from R1", R3, R1);
  TestValidator.notEquals("R3 differs from R2", R3, R2);
}
