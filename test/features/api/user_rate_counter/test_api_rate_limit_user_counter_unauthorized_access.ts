import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ITodoAppUserRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserRateCounter";

/**
 * Verify admin-only protection for user rate counter read when unauthenticated.
 *
 * This test ensures that accessing the admin endpoint to read a user-scoped
 * rate counter requires authentication. We intentionally use a connection
 * without authorization headers and expect the request to be denied. We do NOT
 * assert specific HTTP status codes per policy; we only assert that an error
 * occurs.
 *
 * Steps:
 *
 * 1. Create an unauthenticated connection by cloning the given connection and
 *    setting headers to an empty object (no token). Do not mutate headers
 *    afterward.
 * 2. Generate syntactically valid UUIDs for both path parameters.
 * 3. Attempt to call the admin-only endpoint with the unauthenticated connection.
 * 4. Assert that an error is thrown (access denied), without validating any
 *    specific HTTP status code.
 */
export async function test_api_rate_limit_user_counter_unauthorized_access(
  connection: api.IConnection,
) {
  // 1) Build an unauthenticated connection (do not mutate headers after creation)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 2) Generate valid UUIDs for path params
  const rateLimitId = typia.random<string & tags.Format<"uuid">>();
  const userRateCounterId = typia.random<string & tags.Format<"uuid">>();

  // 3) Attempt to access admin-only endpoint without authentication
  // 4) Assert that an error is thrown; do not validate specific status codes
  await TestValidator.error(
    "admin-only endpoint denies unauthenticated access",
    async () => {
      await api.functional.todoApp.systemAdmin.rateLimits.userRateCounters.at(
        unauthConn,
        { rateLimitId, userRateCounterId },
      );
    },
  );
}
