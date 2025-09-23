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
 * List IP rate counters filtered by a specific policy with pagination and
 * sorting.
 *
 * Business flow:
 *
 * 1. Register a system administrator to gain authorized access.
 * 2. Create a rate limit policy (scope: ip, category: auth) to be used as a
 *    filter.
 * 3. Call the listing endpoint with filters (by created policy), sort by
 *    last_action_at desc, and pagination (page=1, limit=20),
 *    blocked_only=false.
 * 4. Validate:
 *
 *    - Response type and pagination numbers are non-negative and within limits
 *         (limit <= 100).
 *    - Every record belongs to the policy used for filtering.
 *    - Counts are non-negative; window_end >= window_start.
 *    - If last_action_at values exist, results are non-increasing by that field
 *         (desc).
 *    - Empty data is acceptable.
 */
export async function test_api_ip_rate_counters_filter_pagination(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin (join)
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 2) Create a rate limit policy (ip scope / auth category)
  const randomSuffix = RandomGenerator.alphaNumeric(8);
  const createPolicyBody = {
    code: `ip_auth_${randomSuffix}`,
    name: `IP auth ${randomSuffix}`,
    description: RandomGenerator.paragraph({ sentences: 5 }),
    scope: "ip",
    category: "auth",
    window_seconds: 60,
    max_requests: 20,
    sliding_window: false,
    enabled: true,
  } satisfies ITodoAppRateLimit.ICreate;
  const policy = await api.functional.todoApp.systemAdmin.rateLimits.create(
    connection,
    { body: createPolicyBody },
  );
  typia.assert(policy);

  // 3) Query IP rate counters filtered by the created policy
  const request = {
    page: 1,
    limit: 20,
    todo_app_rate_limit_id: policy.id,
    sort: "last_action_at desc",
    blocked_only: false,
  } satisfies ITodoAppIpRateCounter.IRequest;
  const page = await api.functional.todoApp.systemAdmin.ipRateCounters.index(
    connection,
    { body: request },
  );
  typia.assert(page);

  // 4) Validations
  const p = page.pagination;
  TestValidator.predicate("pagination.current is non-negative", p.current >= 0);
  TestValidator.predicate(
    "pagination.limit within 0..100",
    p.limit >= 0 && p.limit <= 100,
  );
  TestValidator.predicate("pagination.records is non-negative", p.records >= 0);
  TestValidator.predicate("pagination.pages is non-negative", p.pages >= 0);

  // Each item must match the filter and have logical counters
  for (const item of page.data) {
    TestValidator.equals(
      "item belongs to created policy",
      item.todo_app_rate_limit_id,
      policy.id,
    );
    TestValidator.predicate("count is non-negative", item.count >= 0);
    TestValidator.predicate(
      "window_ends_at >= window_started_at",
      new Date(item.window_ends_at).getTime() >=
        new Date(item.window_started_at).getTime(),
    );
  }

  // Sorting check: last_action_at desc where values exist
  let prevTime: number | null = null;
  for (const item of page.data) {
    const ts = item.last_action_at;
    if (ts !== null && ts !== undefined) {
      const cur = new Date(ts).getTime();
      if (prevTime !== null) {
        TestValidator.predicate(
          "last_action_at is non-increasing (desc)",
          cur <= prevTime,
        );
      }
      prevTime = cur;
    }
  }
}
