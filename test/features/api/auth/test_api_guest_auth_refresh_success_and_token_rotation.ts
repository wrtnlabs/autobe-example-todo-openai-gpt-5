import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoMvpGuest } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpGuest";
import type { ITodoMvpGuestRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpGuestRefresh";

/**
 * Validate guest refresh rotates tokens and prevents replay.
 *
 * Business context:
 *
 * - Guests establish an anonymous session via POST /auth/guest/join.
 * - Tokens can be renewed via POST /auth/guest/refresh using the refresh token.
 * - On successful refresh, access/refresh tokens rotate and token expirations
 *   extend.
 * - The previous refresh token must be invalidated (replay must fail).
 *
 * Steps:
 *
 * 1. Join as a guest to get initial authorization bundle A.
 * 2. Refresh using A.token.refresh → get bundle B.
 * 3. Validate rotation and extension: tokens differ; expiry fields move forward;
 *    identity is stable.
 * 4. Attempt to reuse the old refresh token (A.token.refresh) and expect an error.
 * 5. Optionally refresh again using B.token.refresh and verify rotation/extension
 *    monotonicity.
 */
export async function test_api_guest_auth_refresh_success_and_token_rotation(
  connection: api.IConnection,
) {
  // Helper to compare ISO timestamps
  const toMillis = (iso: string): number => new Date(iso).getTime();

  // 1) Establish initial guest session
  const initial = await api.functional.auth.guest.join(connection, {
    body: {} satisfies ITodoMvpGuest.ICreate,
  });
  typia.assert(initial);

  // Snapshot A
  const aId = initial.id;
  const aCreatedAt = initial.created_at;
  const aAccess = initial.token.access;
  const aRefresh = initial.token.refresh;
  const aExpiredAt = initial.token.expired_at;
  const aRefreshableUntil = initial.token.refreshable_until;

  // 2) Refresh using initial refresh token → bundle B
  const refreshed = await api.functional.auth.guest.refresh(connection, {
    body: { refresh_token: aRefresh } satisfies ITodoMvpGuestRefresh.IRequest,
  });
  typia.assert(refreshed);

  // 3) Business validations for rotation and extension
  TestValidator.equals(
    "guest id remains stable after refresh",
    refreshed.id,
    aId,
  );
  TestValidator.equals(
    "guest created_at remains unchanged after refresh",
    refreshed.created_at,
    aCreatedAt,
  );
  TestValidator.notEquals(
    "access token rotates on refresh",
    refreshed.token.access,
    aAccess,
  );
  TestValidator.notEquals(
    "refresh token rotates on refresh",
    refreshed.token.refresh,
    aRefresh,
  );
  TestValidator.predicate(
    "expired_at extends after refresh (strictly later)",
    toMillis(refreshed.token.expired_at) > toMillis(aExpiredAt),
  );
  TestValidator.predicate(
    "refreshable_until extends after refresh (strictly later)",
    toMillis(refreshed.token.refreshable_until) > toMillis(aRefreshableUntil),
  );

  // 4) Reuse of old refresh token must fail (replay prevention)
  await TestValidator.error("reusing old refresh token must fail", async () => {
    await api.functional.auth.guest.refresh(connection, {
      body: { refresh_token: aRefresh } satisfies ITodoMvpGuestRefresh.IRequest,
    });
  });

  // 5) Optional: second successful refresh using latest refresh token to ensure monotonicity
  const second = await api.functional.auth.guest.refresh(connection, {
    body: {
      refresh_token: refreshed.token.refresh,
    } satisfies ITodoMvpGuestRefresh.IRequest,
  });
  typia.assert(second);

  // Validate continued rotation and extension
  TestValidator.equals(
    "guest id remains stable after second refresh",
    second.id,
    aId,
  );
  TestValidator.notEquals(
    "access token rotates again on second refresh",
    second.token.access,
    refreshed.token.access,
  );
  TestValidator.notEquals(
    "refresh token rotates again on second refresh",
    second.token.refresh,
    refreshed.token.refresh,
  );
  TestValidator.predicate(
    "expired_at extends again (strictly later than first refresh)",
    toMillis(second.token.expired_at) > toMillis(refreshed.token.expired_at),
  );
  TestValidator.predicate(
    "refreshable_until extends again (strictly later than first refresh)",
    toMillis(second.token.refreshable_until) >
      toMillis(refreshed.token.refreshable_until),
  );
}
