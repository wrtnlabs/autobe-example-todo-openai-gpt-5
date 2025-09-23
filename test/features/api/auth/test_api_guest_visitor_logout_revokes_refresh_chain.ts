import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppGuestVisitor";
import type { ITodoAppSessionRevocation } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSessionRevocation";

/**
 * Logout revokes the current session and its refresh token chain.
 *
 * Business context:
 *
 * - A guestVisitor joins to obtain access and refresh tokens.
 * - Refresh rotation produces a new child refresh token and marks the parent as
 *   rotated.
 * - Logout records a session revocation and invalidates the refresh chain for
 *   that session.
 *
 * Steps:
 *
 * 1. Join as guest visitor (POST /auth/guestVisitor/join) to get initial tokens.
 * 2. Rotate once (POST /auth/guestVisitor/refresh) to produce a child refresh
 *    token.
 *
 *    - Validate same subject id; ensure refresh tokens differ.
 *    - Reusing the rotated (old) refresh token must fail.
 * 3. Logout (POST /auth/guestVisitor/logout) with an optional reason.
 * 4. Attempt to refresh with the latest token after logout; expect failure.
 */
export async function test_api_guest_visitor_logout_revokes_refresh_chain(
  connection: api.IConnection,
) {
  // 1) Join as guest visitor
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
  } satisfies ITodoAppGuestVisitor.IJoin;
  const authorized1 = await api.functional.auth.guestVisitor.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized1);

  const initialRefresh: string = authorized1.token.refresh;

  // 2) Rotate once via refresh
  const refreshBody1 = {
    refresh_token: initialRefresh,
  } satisfies ITodoAppGuestVisitor.IRefreshRequest;
  const authorized2 = await api.functional.auth.guestVisitor.refresh(
    connection,
    { body: refreshBody1 },
  );
  typia.assert(authorized2);

  // Same subject id should persist across refresh
  TestValidator.equals(
    "subject id remains the same after refresh",
    authorized2.id,
    authorized1.id,
  );
  // Refresh token must change after rotation
  TestValidator.notEquals(
    "refresh token changes after rotation",
    authorized2.token.refresh,
    initialRefresh,
  );

  // Reusing the rotated (old) refresh token should fail
  await TestValidator.error(
    "reusing rotated refresh token is rejected",
    async () => {
      await api.functional.auth.guestVisitor.refresh(connection, {
        body: {
          refresh_token: initialRefresh,
        } satisfies ITodoAppGuestVisitor.IRefreshRequest,
      });
    },
  );

  const latestRefresh: string = authorized2.token.refresh;

  // 3) Logout
  const logoutBody = {
    reason: "user_logout",
  } satisfies ITodoAppSessionRevocation.ICreate;
  const revocation = await api.functional.auth.guestVisitor.logout(connection, {
    body: logoutBody,
  });
  typia.assert(revocation);

  // 4) Attempt to refresh with the latest token after logout; expect failure
  await TestValidator.error(
    "refresh after logout must fail due to revoked chain",
    async () => {
      await api.functional.auth.guestVisitor.refresh(connection, {
        body: {
          refresh_token: latestRefresh,
        } satisfies ITodoAppGuestVisitor.IRefreshRequest,
      });
    },
  );
}
