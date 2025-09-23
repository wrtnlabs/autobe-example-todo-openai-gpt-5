import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppIpRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppIpRateCounter";
import type { ITodoAppIpRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppIpRateCounter";

/**
 * Verify that unauthenticated access to the system-admin IP rate counters
 * listing endpoint is denied.
 *
 * Business context:
 *
 * - The endpoint exposes operational telemetry and must be restricted to system
 *   administrators.
 * - Unauthenticated clients must not be able to retrieve any data from this
 *   endpoint.
 *
 * Steps:
 *
 * 1. Create an unauthenticated connection (empty headers) without touching the
 *    original connection's headers.
 * 2. Build a minimal, valid request body (page=1, limit=10) satisfying
 *    ITodoAppIpRateCounter.IRequest.
 * 3. Call PATCH /todoApp/systemAdmin/ipRateCounters using the unauthenticated
 *    connection.
 * 4. Assert that the call fails (authorization enforced). Do not check specific
 *    HTTP status codes.
 */
export async function test_api_ip_rate_counters_unauthorized_access(
  connection: api.IConnection,
) {
  // 1) Create an unauthenticated connection (do not manipulate the original headers)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 2) Minimal, valid search body adhering to ITodoAppIpRateCounter.IRequest
  const requestBody = {
    page: 1,
    limit: 10,
  } satisfies ITodoAppIpRateCounter.IRequest;

  // 3) Attempt to access with unauthenticated connection and
  // 4) assert authorization is enforced (no status code checks per policy)
  await TestValidator.error(
    "deny unauthenticated access to PATCH /todoApp/systemAdmin/ipRateCounters",
    async () => {
      await api.functional.todoApp.systemAdmin.ipRateCounters.index(
        unauthConn,
        { body: requestBody },
      );
    },
  );
}
