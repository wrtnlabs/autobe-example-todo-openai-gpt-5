import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppGuestVisitor";
import type { ITodoAppSessionRevocation } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSessionRevocation";

/**
 * Verify that a guestVisitor's refresh fails after the session has been revoked
 * via logout, and that logout behavior is idempotent.
 *
 * Steps:
 *
 * 1. Join as guestVisitor to obtain access/refresh tokens (A1/R1).
 * 2. Logout with an optional reason, revoking the active session.
 * 3. Call logout again to confirm idempotent behavior (still succeeds).
 * 4. Attempt to refresh using the original R1 after logout → expect failure.
 *
 * Validations:
 *
 * - Typia.assert() on successful responses (join, logout 1, logout 2)
 * - Same session id appears in both logout summaries
 * - TestValidator.error() confirms refresh after logout fails (no status code
 *   checks)
 */
export async function test_api_guest_visitor_refresh_after_logout_session_revoked(
  connection: api.IConnection,
) {
  // 1) Join as guestVisitor → obtain initial credentials with access/refresh
  const authorized = await api.functional.auth.guestVisitor.join(connection, {
    body: {
      // Optional email; include a valid email to exercise email handling.
      email: typia.random<string & tags.Format<"email">>(),
    } satisfies ITodoAppGuestVisitor.IJoin,
  });
  typia.assert(authorized);

  const oldRefreshToken: string = authorized.token.refresh;

  // 2) Logout to revoke current session
  const logout1 = await api.functional.auth.guestVisitor.logout(connection, {
    body: {
      reason: `user_logout:${RandomGenerator.alphabets(8)}`,
    } satisfies ITodoAppSessionRevocation.ICreate,
  });
  typia.assert(logout1);

  // 3) Logout again to verify idempotency
  const logout2 = await api.functional.auth.guestVisitor.logout(connection, {
    body: {
      reason: `repeat_logout:${RandomGenerator.alphabets(8)}`,
    } satisfies ITodoAppSessionRevocation.ICreate,
  });
  typia.assert(logout2);

  // Same session id should be referenced
  TestValidator.equals(
    "idempotent logout returns summary for the same session",
    logout2.todo_app_session_id,
    logout1.todo_app_session_id,
  );

  // 4) Attempt refresh with the old refresh token → must fail
  await TestValidator.error("refresh after logout must fail", async () => {
    await api.functional.auth.guestVisitor.refresh(connection, {
      body: {
        refresh_token: oldRefreshToken,
      } satisfies ITodoAppGuestVisitor.IRefreshRequest,
    });
  });
}
