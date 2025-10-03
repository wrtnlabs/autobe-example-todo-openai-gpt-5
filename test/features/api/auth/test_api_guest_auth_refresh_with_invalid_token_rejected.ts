import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoMvpGuest } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpGuest";
import type { ITodoMvpGuestRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpGuestRefresh";

/**
 * Verify that guest refresh rejects invalid tokens.
 *
 * Scenario:
 *
 * - Create a fresh unauthenticated connection to avoid cross-test header leakage
 * - Prepare two invalid refresh token shapes (gibberish and corrupted JWT-like)
 * - Call POST /auth/guest/refresh with each invalid token and expect the call to
 *   fail
 * - Do not validate status codes or error messages; only ensure an error occurs
 * - Do not touch connection.headers beyond creating the clean unauthenticated
 *   copy
 */
export async function test_api_guest_auth_refresh_with_invalid_token_rejected(
  connection: api.IConnection,
) {
  // Use a clean unauthenticated connection (never touch after creation)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // Construct invalid tokens that still satisfy DTO typing (string)
  const gibberishToken: string = RandomGenerator.alphaNumeric(64);
  const corruptedJwtLike: string = [
    RandomGenerator.alphaNumeric(8),
    RandomGenerator.alphaNumeric(6),
    RandomGenerator.alphaNumeric(10),
  ].join(".");

  // 1) Random gibberish token should be rejected
  await TestValidator.error(
    "refresh with random gibberish token should be rejected",
    async () => {
      await api.functional.auth.guest.refresh(unauthConn, {
        body: {
          refresh_token: gibberishToken,
        } satisfies ITodoMvpGuestRefresh.IRequest,
      });
    },
  );

  // 2) Corrupted JWT-like token should be rejected
  await TestValidator.error(
    "refresh with corrupted jwt-like token should be rejected",
    async () => {
      await api.functional.auth.guest.refresh(unauthConn, {
        body: {
          refresh_token: corruptedJwtLike,
        } satisfies ITodoMvpGuestRefresh.IRequest,
      });
    },
  );
}
