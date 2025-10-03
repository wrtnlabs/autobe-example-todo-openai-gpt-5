import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";

/**
 * Verify admin logout rejects unauthenticated requests.
 *
 * Purpose:
 *
 * - Ensure POST /auth/admin/logout requires an authenticated admin session.
 * - Anonymous calls must be denied and result in an error.
 *
 * Steps:
 *
 * 1. Prepare an unauthenticated connection by copying the given connection and
 *    setting headers: {}.
 * 2. Invoke api.functional.auth.admin.logout with the unauthenticated connection.
 * 3. Assert that an error occurs using TestValidator.error (no status code
 *    checks).
 */
export async function test_api_admin_logout_unauthorized(
  connection: api.IConnection,
) {
  // 1) Prepare unauthenticated connection (do not mutate headers afterwards)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 2-3) Expect an error when logging out without authentication
  await TestValidator.error(
    "unauthenticated admin logout must be denied",
    async () => {
      await api.functional.auth.admin.logout(unauthConn);
    },
  );
}
