import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";
import type { ITodoMvpUserRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUserRefresh";

/**
 * Validate successful session refresh and token rotation for a user.
 *
 * Workflow:
 *
 * 1. Register a brand-new user via join to obtain an initial authorization bundle
 *    (access/refresh tokens).
 * 2. Call POST /auth/user/refresh with the valid refresh token and get a new
 *    authorization payload.
 * 3. Validate token rotation: access and refresh tokens differ from previous.
 * 4. Validate identity invariants: id, email, and status remain the same.
 * 5. Validate token lifetime movement: expired_at (access) and refreshable_until
 *    are moved forward.
 * 6. Negative check: attempt to reuse the old refresh token and expect an error.
 * 7. Optional: perform a second refresh with the latest refresh token and validate
 *    rotation again.
 */
export async function test_api_user_session_refresh_success(
  connection: api.IConnection,
) {
  // 1) Register a new user to obtain initial tokens
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphabets(12), // >= 8 chars
  } satisfies ITodoMvpUser.ICreate;

  const joined = await api.functional.auth.user.join(connection, {
    body: joinBody,
  });
  typia.assert(joined);

  // Capture initial token set
  const initialAccess: string = joined.token.access;
  const initialRefresh: string = joined.token.refresh;
  const initialExpiredAt: string = joined.token.expired_at;
  const initialRefreshableUntil: string = joined.token.refreshable_until;

  // 2) Refresh with the valid refresh token
  const refreshed1 = await api.functional.auth.user.refresh(connection, {
    body: {
      refresh_token: initialRefresh,
    } satisfies ITodoMvpUserRefresh.IRequest,
  });
  typia.assert(refreshed1);

  // 3) Token rotation checks
  TestValidator.notEquals(
    "access token must rotate on refresh",
    refreshed1.token.access,
    initialAccess,
  );
  TestValidator.notEquals(
    "refresh token must rotate on refresh",
    refreshed1.token.refresh,
    initialRefresh,
  );

  // 4) Identity invariants
  TestValidator.equals(
    "user id unchanged after refresh",
    refreshed1.id,
    joined.id,
  );
  TestValidator.equals(
    "user email unchanged after refresh",
    refreshed1.email,
    joined.email,
  );
  TestValidator.equals(
    "user status unchanged after refresh",
    refreshed1.status,
    joined.status,
  );

  // 5) Token lifetime movement
  const t0Access = Date.parse(initialExpiredAt);
  const t1Access = Date.parse(refreshed1.token.expired_at);
  TestValidator.predicate(
    "access token expiration should move forward",
    t1Access > t0Access,
  );

  const t0Refreshable = Date.parse(initialRefreshableUntil);
  const t1Refreshable = Date.parse(refreshed1.token.refreshable_until);
  TestValidator.predicate(
    "refresh token refreshable_until should be same or later",
    t1Refreshable >= t0Refreshable,
  );

  // 6) Negative: old refresh token must not be reusable after rotation
  await TestValidator.error(
    "old refresh token cannot be reused after rotation",
    async () => {
      await api.functional.auth.user.refresh(connection, {
        body: {
          refresh_token: initialRefresh,
        } satisfies ITodoMvpUserRefresh.IRequest,
      });
    },
  );

  // 7) Optional: refresh again with the latest (valid) refresh token
  const refreshed2 = await api.functional.auth.user.refresh(connection, {
    body: {
      refresh_token: refreshed1.token.refresh,
    } satisfies ITodoMvpUserRefresh.IRequest,
  });
  typia.assert(refreshed2);

  TestValidator.notEquals(
    "second refresh must rotate access again",
    refreshed2.token.access,
    refreshed1.token.access,
  );
  TestValidator.notEquals(
    "second refresh must rotate refresh again",
    refreshed2.token.refresh,
    refreshed1.token.refresh,
  );

  // Identity remains consistent across all steps
  TestValidator.equals(
    "user id consistent across all refreshes",
    refreshed2.id,
    joined.id,
  );
  TestValidator.equals(
    "user email consistent across all refreshes",
    refreshed2.email,
    joined.email,
  );
  TestValidator.equals(
    "user status consistent across all refreshes",
    refreshed2.status,
    joined.status,
  );

  // Lifetime progression keeps monotonicity for access token expiry
  const t2Access = Date.parse(refreshed2.token.expired_at);
  TestValidator.predicate(
    "access token expiration should never decrease",
    t2Access >= t1Access,
  );
}
