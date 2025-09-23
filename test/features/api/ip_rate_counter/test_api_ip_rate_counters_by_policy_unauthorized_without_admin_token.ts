import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppIpRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppIpRateCounter";
import type { ITodoAppIpRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppIpRateCounter";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Admin-only IP rate counter listing must reject non-admin and unauthenticated
 * access.
 *
 * This test validates that the admin-scoped endpoint PATCH
 * /todoApp/systemAdmin/rateLimits/{rateLimitId}/ipRateCounters rejects requests
 * that either:
 *
 * 1. Have no authentication token, or
 * 2. Are authenticated as a normal todoUser (non-admin role).
 *
 * Steps:
 *
 * 1. Build a valid listing request body tied to a random rateLimitId.
 * 2. Using an unauthenticated connection (empty headers), call the endpoint and
 *    assert that an error is thrown (authorization required).
 * 3. Register a normal todoUser account via /auth/todoUser/join (this sets a
 *    non-admin Authorization token in the shared connection).
 * 4. Call the endpoint again using this non-admin token and assert that an error
 *    is thrown (forbidden for non-admin roles).
 *
 * Notes:
 *
 * - We intentionally do not assert specific HTTP status codes.
 * - We never manipulate connection.headers directly except creating a fresh
 *   unauthenticated clone with headers: {} per policy.
 */
export async function test_api_ip_rate_counters_by_policy_unauthorized_without_admin_token(
  connection: api.IConnection,
) {
  // 1) Prepare a random policy ID and a valid listing request body
  const rateLimitId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();

  const requestBody = {
    page: 1,
    limit: 10,
    todo_app_rate_limit_id: rateLimitId,
  } satisfies ITodoAppIpRateCounter.IRequest;

  // 2) Unauthenticated attempt: use a clean connection with empty headers
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated connection cannot list admin IP rate counters",
    async () => {
      await api.functional.todoApp.systemAdmin.rateLimits.ipRateCounters.index(
        unauthConn,
        {
          rateLimitId,
          body: requestBody,
        },
      );
    },
  );

  // 3) Non-admin (todoUser) attempt: join to get a normal user token
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphabets(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authorized);

  // 4) Attempt the admin-only listing as non-admin token (should fail)
  await TestValidator.error(
    "non-admin todoUser cannot list admin IP rate counters",
    async () => {
      await api.functional.todoApp.systemAdmin.rateLimits.ipRateCounters.index(
        connection,
        {
          rateLimitId,
          body: requestBody,
        },
      );
    },
  );
}
