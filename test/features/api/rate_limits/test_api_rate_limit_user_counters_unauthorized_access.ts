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
 * Ensure admin-only user rate counters listing denies unauthenticated access.
 *
 * Context:
 *
 * - The endpoint lists user rate counter windows under a specific rate limit
 *   policy.
 * - Access is restricted to system administrators due to cross-user visibility.
 *
 * Steps:
 *
 * 1. Construct an unauthenticated connection by cloning the given connection with
 *    empty headers.
 * 2. Call PATCH /todoApp/systemAdmin/rateLimits/{rateLimitId}/userRateCounters
 *    with:
 *
 *    - RateLimitId: syntactically valid UUID
 *    - Body: minimal empty request satisfying ITodoAppUserRateCounter.IRequest
 * 3. Assert that the call results in an error (authorization failure). Do not
 *    assert specific status codes.
 */
export async function test_api_rate_limit_user_counters_unauthorized_access(
  connection: api.IConnection,
) {
  // 1) Create an unauthenticated connection (do not manipulate headers afterwards)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 2) Prepare inputs: valid rateLimitId and minimal body
  const rateLimitId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();
  const minimalBody = {} satisfies ITodoAppUserRateCounter.IRequest;

  // 3) Call the endpoint and expect an authorization error
  await TestValidator.error(
    "deny unauthenticated listing of user rate counters by policy",
    async () => {
      await api.functional.todoApp.systemAdmin.rateLimits.userRateCounters.index(
        unauthConn,
        {
          rateLimitId,
          body: minimalBody,
        },
      );
    },
  );
}
