import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ERateLimitCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ERateLimitCategory";
import type { ERateLimitScope } from "@ORGANIZATION/PROJECT-api/lib/structures/ERateLimitScope";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { ESortTodoAppUserRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortTodoAppUserRateCounter";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppUserRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppUserRateCounter";
import type { ITodoAppRateLimit } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppRateLimit";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppUserRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserRateCounter";

export async function test_api_rate_limit_user_counters_filter_pagination(
  connection: api.IConnection,
) {
  /**
   * Validate listing of user rate counters scoped by a specific rate limit
   * policy.
   *
   * Steps:
   *
   * 1. Admin join (auth). SDK will attach token automatically.
   * 2. Create rate limit policy (scope=user, category=auth, window 60s, max 5).
   * 3. List counters under policy with filters: page=1, limit=20,
   *    order_by=window_started_at desc, blocked_only=false.
   * 4. Validate pagination and item coherence; allow empty results.
   * 5. Validate business rule error when limit>100.
   */
  // 1) Authenticate as system admin
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, { body: joinBody });
  typia.assert(admin);

  // 2) Create a rate limit policy (user/auth/60s/5)
  const createPolicyBody = {
    code: `auth_user_per_min_${RandomGenerator.alphaNumeric(8)}`,
    name: "Auth user per minute",
    description: RandomGenerator.paragraph({ sentences: 6 }),
    scope: "user",
    category: "auth",
    window_seconds: 60,
    max_requests: 5,
    burst_size: null,
    sliding_window: false,
    enabled: true,
  } satisfies ITodoAppRateLimit.ICreate;
  const policy: ITodoAppRateLimit =
    await api.functional.todoApp.systemAdmin.rateLimits.create(connection, {
      body: createPolicyBody,
    });
  typia.assert(policy);

  // 3) List counters with filters and pagination
  const request = {
    page: 1,
    limit: 20,
    todo_app_rate_limit_id: policy.id,
    blocked_only: false,
    order_by: "window_started_at",
    order_dir: "desc",
  } satisfies ITodoAppUserRateCounter.IRequest;
  const page: IPageITodoAppUserRateCounter =
    await api.functional.todoApp.systemAdmin.rateLimits.userRateCounters.index(
      connection,
      { rateLimitId: policy.id, body: request },
    );
  typia.assert(page);

  // 4) Validations for pagination and records
  await TestValidator.predicate(
    "pagination current must be >= 1",
    async () => page.pagination.current >= 1,
  );
  await TestValidator.predicate(
    "pagination limit must be between 1 and 100",
    async () => page.pagination.limit >= 1 && page.pagination.limit <= 100,
  );
  await TestValidator.predicate(
    "items length must be <= limit",
    async () => page.data.length <= page.pagination.limit,
  );

  if (page.data.length > 0) {
    for (const [i, item] of page.data.entries()) {
      TestValidator.equals(
        `item[${i}] belongs to the target policy`,
        item.todo_app_rate_limit_id,
        policy.id,
      );

      const startedAt = new Date(item.window_started_at).getTime();
      const endsAt = new Date(item.window_ends_at).getTime();
      await TestValidator.predicate(
        `item[${i}] temporal window coherent (start <= end)`,
        async () => startedAt <= endsAt,
      );

      if (item.last_action_at !== null && item.last_action_at !== undefined) {
        const last = new Date(item.last_action_at).getTime();
        await TestValidator.predicate(
          `item[${i}] last_action_at within window`,
          async () => startedAt <= last && last <= endsAt,
        );
      }
    }

    for (let i = 1; i < page.data.length; i++) {
      const prev = new Date(page.data[i - 1].window_started_at).getTime();
      const curr = new Date(page.data[i].window_started_at).getTime();
      await TestValidator.predicate(
        `sorted by window_started_at desc at index ${i}`,
        async () => prev >= curr,
      );
    }
  }

  // 5) Error scenario: limit > 100 should fail
  const tooLarge = {
    page: 1,
    limit: 101,
    order_by: "window_started_at",
    order_dir: "desc",
  } satisfies ITodoAppUserRateCounter.IRequest;
  await TestValidator.error("limit above 100 should be rejected", async () => {
    await api.functional.todoApp.systemAdmin.rateLimits.userRateCounters.index(
      connection,
      { rateLimitId: policy.id, body: tooLarge },
    );
  });
}
