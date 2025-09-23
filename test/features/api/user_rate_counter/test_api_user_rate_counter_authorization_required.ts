import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { ESortTodoAppUserRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortTodoAppUserRateCounter";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppUserRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppUserRateCounter";
import type { ITodoAppUserRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserRateCounter";

/**
 * Verify that admin-only user rate counter search rejects unauthenticated
 * requests.
 *
 * Context:
 *
 * - Endpoint: PATCH /todoApp/systemAdmin/userRateCounters (admin/systemAdmin
 *   only)
 * - Purpose: Ensure guests (no auth) cannot access sensitive rate counter data.
 *
 * Steps:
 *
 * 1. Build a minimal, schema-valid request payload.
 * 2. If in simulate mode, perform a type-assertion smoke call (auth is not
 *    enforced in mock) and exit.
 * 3. Create an unauthenticated connection (headers: {}).
 * 4. Call the endpoint and expect an error (authorization required), without
 *    asserting specific status codes.
 */
export async function test_api_user_rate_counter_authorization_required(
  connection: api.IConnection,
) {
  // 1) Minimal, schema-valid request body
  const requestBody = {
    page: 1,
    limit: 10,
    order_by: "window_started_at",
    order_dir: "desc",
    blocked_only: false,
  } satisfies ITodoAppUserRateCounter.IRequest;

  // 2) If simulate mode is enabled, SDK returns mock data without auth checks
  if (connection.simulate === true) {
    const output =
      await api.functional.todoApp.systemAdmin.userRateCounters.index(
        connection,
        { body: requestBody },
      );
    typia.assert(output);
    await TestValidator.predicate(
      "simulation mode returns a paginated result without enforcing auth",
      async () => Array.isArray(output.data),
    );
    return;
  }

  // 3) Unauthenticated connection: do not manipulate headers except initializing empty headers
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 4) Expect authorization failure (no specific status code assertions)
  await TestValidator.error(
    "admin endpoint must reject unauthenticated access",
    async () => {
      await api.functional.todoApp.systemAdmin.userRateCounters.index(
        unauthConn,
        { body: requestBody },
      );
    },
  );
}
