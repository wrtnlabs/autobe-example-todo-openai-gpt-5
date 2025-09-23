import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ITodoAppSessionRevocation } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSessionRevocation";

/**
 * Ensure unauthenticated guestVisitor logout is rejected.
 *
 * Purpose:
 *
 * - Validate that POST /auth/guestVisitor/logout enforces authentication.
 * - When invoked without any Authorization header, the request must fail.
 *
 * Steps:
 *
 * 1. Create an unauthenticated connection by cloning the provided connection and
 *    setting empty headers.
 * 2. Invoke logout with a valid ICreate body (optional reason provided) to
 *    guarantee failure stems from authentication.
 * 3. Assert that an error is thrown using TestValidator.error (no status code
 *    assertions).
 */
export async function test_api_guest_visitor_logout_without_authentication(
  connection: api.IConnection,
) {
  // 1) Create an unauthenticated connection (do not manipulate headers after creation)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 2) Call logout without authentication and 3) assert it fails
  await TestValidator.error(
    "guestVisitor logout without authentication should be rejected",
    async () => {
      await api.functional.auth.guestVisitor.logout(unauthConn, {
        body: {
          reason: "user_logout",
        } satisfies ITodoAppSessionRevocation.ICreate,
      });
    },
  );
}
