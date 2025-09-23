import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ITodoAppUserRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserRateCounter";

/**
 * Verify unauthorized access is denied for systemAdmin-only user rate counters.
 *
 * Purpose:
 *
 * - Ensure that calling GET
 *   /todoApp/systemAdmin/userRateCounters/{userRateCounterId} without any
 *   authentication is rejected and does not leak resource existence.
 *
 * Notes:
 *
 * - In simulate mode (connection.simulate === true), the SDK returns random data
 *   and bypasses authorization. In that case, we exercise the call and validate
 *   the response shape instead of expecting an error.
 *
 * Steps:
 *
 * 1. Generate a syntactically valid UUID for the path parameter.
 * 2. If not in simulate mode, clone the connection with empty headers to remove
 *    authentication context and invoke the endpoint, expecting an error.
 * 3. If in simulate mode, call the endpoint and validate the returned entity type.
 */
export async function test_api_user_rate_counter_unauthorized_access(
  connection: api.IConnection,
) {
  const userRateCounterId = typia.random<string & tags.Format<"uuid">>();

  if (connection.simulate === true) {
    // Simulation returns random data without enforcing auth; just validate the shape.
    const output = await api.functional.todoApp.systemAdmin.userRateCounters.at(
      connection,
      { userRateCounterId },
    );
    typia.assert<ITodoAppUserRateCounter>(output);
    return;
  }

  // Create an unauthenticated connection (do not touch headers afterward).
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  await TestValidator.error(
    "denies unauthenticated access to systemAdmin userRateCounters.at",
    async () => {
      await api.functional.todoApp.systemAdmin.userRateCounters.at(unauthConn, {
        userRateCounterId,
      });
    },
  );
}
