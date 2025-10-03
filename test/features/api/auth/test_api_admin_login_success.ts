import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { IEAdminStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAdminStatus";
import type { ITodoMvpAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdmin";
import type { ITodoMvpAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdminJoin";
import type { ITodoMvpAdminLogin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdminLogin";

/**
 * Admin login success flow with fresh registration.
 *
 * Purpose
 *
 * - Ensure an administrator can authenticate successfully using valid
 *   credentials.
 * - Validate identity consistency and token issuance semantics per DTO contracts.
 *
 * Steps
 *
 * 1. Join: Create a brand-new admin with unique email/password (min length 8).
 * 2. Login: Authenticate using the same credentials.
 * 3. Validate: Ensure returned ITodoMvpAdmin.IAuthorized structure is correct,
 *    identity matches, timestamps are coherent, and tokens are present.
 *
 * Notes
 *
 * - SDK manages Authorization header automatically; do not touch
 *   connection.headers.
 * - No HTTP status code checks; only success path/business validations.
 */
export async function test_api_admin_login_success(
  connection: api.IConnection,
) {
  // 1) Join with fresh credentials
  const email = typia.random<string & tags.Format<"email">>();
  const password = RandomGenerator.alphaNumeric(12); // >= 8 chars

  const joinBody = {
    email,
    password,
  } satisfies ITodoMvpAdminJoin.ICreate;

  const joined = await api.functional.auth.admin.join(connection, {
    body: joinBody,
  });
  typia.assert(joined);

  // Identity basics from join
  TestValidator.equals(
    "joined email should match requested email",
    joined.email,
    joinBody.email,
  );

  // Timestamps coherence for join (updated_at >= created_at)
  const joinCreatedAt = new Date(joined.created_at).getTime();
  const joinUpdatedAt = new Date(joined.updated_at).getTime();
  TestValidator.predicate(
    "join.updated_at should be greater than or equal to join.created_at",
    joinUpdatedAt >= joinCreatedAt,
  );

  // Token lifecycle checks for join
  const joinExpiredAt = new Date(joined.token.expired_at).getTime();
  const joinRefreshableUntil = new Date(
    joined.token.refreshable_until,
  ).getTime();
  TestValidator.predicate(
    "join.token.refreshable_until should be >= join.token.expired_at",
    joinRefreshableUntil >= joinExpiredAt,
  );
  TestValidator.predicate(
    "join.access token should be non-empty",
    joined.token.access.length > 0,
  );
  TestValidator.predicate(
    "join.refresh token should be non-empty",
    joined.token.refresh.length > 0,
  );

  // 2) Login with the same credentials
  const loginBody = {
    email,
    password,
  } satisfies ITodoMvpAdminLogin.ICreate;

  const logged = await api.functional.auth.admin.login(connection, {
    body: loginBody,
  });
  typia.assert(logged);

  // 3) Identity consistency between join and login
  TestValidator.equals(
    "login email should equal joined email",
    logged.email,
    joined.email,
  );
  TestValidator.equals("login id should equal joined id", logged.id, joined.id);

  // Timestamps coherence for login (updated_at >= created_at)
  const loginCreatedAt = new Date(logged.created_at).getTime();
  const loginUpdatedAt = new Date(logged.updated_at).getTime();
  TestValidator.predicate(
    "login.updated_at should be greater than or equal to login.created_at",
    loginUpdatedAt >= loginCreatedAt,
  );

  // Token lifecycle checks for login
  const loginExpiredAt = new Date(logged.token.expired_at).getTime();
  const loginRefreshableUntil = new Date(
    logged.token.refreshable_until,
  ).getTime();
  TestValidator.predicate(
    "login.token.refreshable_until should be >= login.token.expired_at",
    loginRefreshableUntil >= loginExpiredAt,
  );
  TestValidator.predicate(
    "login.access token should be non-empty",
    logged.token.access.length > 0,
  );
  TestValidator.predicate(
    "login.refresh token should be non-empty",
    logged.token.refresh.length > 0,
  );
}
