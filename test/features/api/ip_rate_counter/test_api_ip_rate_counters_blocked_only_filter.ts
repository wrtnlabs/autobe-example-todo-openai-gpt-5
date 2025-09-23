import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ERateLimitCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ERateLimitCategory";
import type { ERateLimitScope } from "@ORGANIZATION/PROJECT-api/lib/structures/ERateLimitScope";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppIpRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppIpRateCounter";
import type { ITodoAppIpRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppIpRateCounter";
import type { ITodoAppRateLimit } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppRateLimit";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Verify that blocked_only filter on IP rate counters works properly.
 *
 * Steps:
 *
 * 1. Join as systemAdmin (authentication established automatically by SDK)
 * 2. Create a rate limit policy (scope = "ip") to filter counters
 * 3. Query IP rate counters with blocked_only = true and the created policy id
 * 4. Validate that all returned counters (if any) are:
 *
 *    - Scoped to the created policy id
 *    - Currently blocked (blocked_until > now)
 * 5. Cross-check that blocked-only results are a subset of the same query without
 *    blocked_only.
 */
export async function test_api_ip_rate_counters_blocked_only_filter(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin (join)
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // 8~64 chars per policy
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const authorized: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: adminJoinBody,
    });
  typia.assert(authorized);

  // 2) Create rate limit policy (scope: "ip")
  const rateLimitBody = {
    code: `ip_block_test_${RandomGenerator.alphaNumeric(8)}`,
    name: `Blocked-only filter test ${RandomGenerator.alphabets(6)}`,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    scope: "ip" as ERateLimitScope,
    category: "auth" as ERateLimitCategory,
    window_seconds: 60,
    max_requests: 5,
    burst_size: null,
    sliding_window: false,
    enabled: true,
  } satisfies ITodoAppRateLimit.ICreate;
  const rateLimit: ITodoAppRateLimit =
    await api.functional.todoApp.systemAdmin.rateLimits.create(connection, {
      body: rateLimitBody,
    });
  typia.assert(rateLimit);

  // 3) Query IP rate counters with blocked_only = true
  const nowIso: string = new Date().toISOString();
  const pageBlocked =
    await api.functional.todoApp.systemAdmin.ipRateCounters.index(connection, {
      body: {
        page: 1,
        limit: 100,
        todo_app_rate_limit_id: rateLimit.id,
        blocked_only: true,
      } satisfies ITodoAppIpRateCounter.IRequest,
    });
  typia.assert(pageBlocked);

  // 4) Validate results: same policy id and blocked_until in future
  TestValidator.predicate(
    "every result has matching policy id",
    pageBlocked.data.every((d) => d.todo_app_rate_limit_id === rateLimit.id),
  );
  const nowMs = Date.parse(nowIso);
  TestValidator.predicate(
    "blocked_only=true returns only future-blocked counters",
    pageBlocked.data.every(
      (d) =>
        d.blocked_until !== null &&
        d.blocked_until !== undefined &&
        Date.parse(d.blocked_until!) > nowMs,
    ),
  );

  // 5) Cross-check: without blocked_only, result should include (superset of) blocked-only items
  const pageAll = await api.functional.todoApp.systemAdmin.ipRateCounters.index(
    connection,
    {
      body: {
        page: 1,
        limit: 100,
        todo_app_rate_limit_id: rateLimit.id,
        blocked_only: null,
      } satisfies ITodoAppIpRateCounter.IRequest,
    },
  );
  typia.assert(pageAll);

  const allIds = new Set(pageAll.data.map((x) => x.id));
  TestValidator.predicate(
    "blocked-only set is subset of unfiltered result by id",
    pageBlocked.data.every((d) => allIds.has(d.id)),
  );
  TestValidator.predicate(
    "blocked-only count <= unfiltered count",
    pageBlocked.data.length <= pageAll.data.length,
  );
}
