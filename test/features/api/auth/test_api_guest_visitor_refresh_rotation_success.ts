import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppGuestVisitor";

/**
 * Validate successful refresh token rotation for guestVisitor.
 *
 * Business goals:
 *
 * - After joining as a guest, client receives initial credentials including
 *   access token and refresh token (R1).
 * - Using R1 with refresh endpoint should issue a new access token and a new
 *   refresh token (R2), while R1 becomes unusable.
 * - Token timestamps are coherent (refreshable_until should not precede
 *   expired_at).
 *
 * Steps:
 *
 * 1. POST /auth/guestVisitor/join → obtain IAuthorized with token (capture A1, R1)
 * 2. POST /auth/guestVisitor/refresh with { refresh_token: R1 } → obtain new
 *    IAuthorized (capture A2, R2)
 * 3. Validate: R2 != R1, A2 != A1, timestamps coherent
 * 4. Validate: reusing R1 fails (single-use rotation)
 * 5. Optional continuity: refresh once more using R2 to confirm session validity
 */
export async function test_api_guest_visitor_refresh_rotation_success(
  connection: api.IConnection,
) {
  // 1) Join as guest to obtain initial credentials (A1, R1)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
  } satisfies ITodoAppGuestVisitor.IJoin;

  const initialAuth: ITodoAppGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.join(connection, {
      body: joinBody,
    });
  typia.assert(initialAuth);

  const r1: string = initialAuth.token.refresh;
  const a1: string = initialAuth.token.access;

  // 2) Refresh using R1 → expect new credentials (A2, R2)
  const refreshBody = {
    refresh_token: r1,
  } satisfies ITodoAppGuestVisitor.IRefreshRequest;

  const refreshed: ITodoAppGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.refresh(connection, {
      body: refreshBody,
    });
  typia.assert(refreshed);

  const r2: string = refreshed.token.refresh;
  const a2: string = refreshed.token.access;

  // 3) Validate rotation results
  TestValidator.notEquals(
    "refresh rotation issues a different refresh token",
    r2,
    r1,
  );
  TestValidator.notEquals("refresh rotation issues a new access token", a2, a1);

  // Timestamp coherence: parseable and refreshable_until >= expired_at
  const exp2 = Date.parse(refreshed.token.expired_at);
  const until2 = Date.parse(refreshed.token.refreshable_until);
  TestValidator.predicate(
    "access token expiration is a valid ISO date-time",
    Number.isNaN(exp2) === false,
  );
  TestValidator.predicate(
    "refreshable_until is a valid ISO date-time",
    Number.isNaN(until2) === false,
  );
  TestValidator.predicate(
    "refreshable_until should not precede access token expiration",
    until2 >= exp2,
  );

  // 4) Prior token should be unusable after rotation
  // Guard for simulate mode: SDK's simulate returns random data and does not enforce errors
  if (connection.simulate !== true) {
    await TestValidator.error(
      "rotated refresh token cannot be reused",
      async () => {
        await api.functional.auth.guestVisitor.refresh(connection, {
          body: {
            refresh_token: r1,
          } satisfies ITodoAppGuestVisitor.IRefreshRequest,
        });
      },
    );
  }

  // 5) Continuity: refresh again with R2 to ensure session validity remains
  const refreshedAgain: ITodoAppGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.refresh(connection, {
      body: {
        refresh_token: r2,
      } satisfies ITodoAppGuestVisitor.IRefreshRequest,
    });
  typia.assert(refreshedAgain);

  TestValidator.notEquals(
    "second rotation produces yet another refresh token",
    refreshedAgain.token.refresh,
    r2,
  );
}
