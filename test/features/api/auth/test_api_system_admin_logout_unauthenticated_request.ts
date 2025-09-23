import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ITodoAppSystemAdminLogout } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminLogout";
import type { ITodoAppSystemAdminLogoutResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminLogoutResult";

/**
 * Ensure unauthenticated admin logout requests are rejected.
 *
 * Business goal:
 *
 * - POST /my/auth/systemAdmin/logout must require an authenticated system admin
 *   session.
 * - When called without authentication, the request should fail.
 *
 * Steps:
 *
 * 1. Create an unauthenticated connection (clone and set empty headers).
 * 2. Call the logout endpoint with a valid ICreate body.
 * 3. Expect an error (no status code assertion) using TestValidator.error.
 * 4. If connection.simulate is true, short-circuit: call once and typia.assert the
 *    mocked response for stability (simulation bypasses auth checks).
 */
export async function test_api_system_admin_logout_unauthenticated_request(
  connection: api.IConnection,
) {
  // If running in SDK simulate mode, the mock will return success regardless of auth.
  // Short-circuit to a type assertion for stability in simulation environments.
  if (connection.simulate === true) {
    const simulated: ITodoAppSystemAdminLogoutResult =
      await api.functional.my.auth.systemAdmin.logout(
        { ...connection, headers: {} },
        {
          body: {
            reason: RandomGenerator.paragraph({ sentences: 3 }),
          } satisfies ITodoAppSystemAdminLogout.ICreate,
        },
      );
    typia.assert(simulated);
    return;
  }

  // 1) Build an unauthenticated connection without any Authorization header
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 2-3) Call the endpoint and expect an error due to missing authentication
  await TestValidator.error(
    "unauthenticated systemAdmin logout must be rejected",
    async () => {
      await api.functional.my.auth.systemAdmin.logout(unauthConn, {
        body: {
          reason: RandomGenerator.paragraph({ sentences: 4 }),
        } satisfies ITodoAppSystemAdminLogout.ICreate,
      });
    },
  );
}
