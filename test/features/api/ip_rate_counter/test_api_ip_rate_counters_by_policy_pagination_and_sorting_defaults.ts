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
 * Validate pagination and default sorting for IP rate counters under a new
 * policy.
 *
 * Business goal:
 *
 * - Ensure admin consoles can safely rely on pagination metadata and sort
 *   handling even when the result set is empty (freshly created policy with no
 *   counters).
 *
 * Steps:
 *
 * 1. Join as systemAdmin (authorization is auto-handled by SDK on success).
 * 2. Create a rate-limit policy (scope: "ip").
 * 3. List IP rate counters for that policy with page=1, limit=20, sort by
 *    last_action_at desc.
 * 4. List again without sort (default sorting) to ensure the same empty structure.
 *
 * Validations:
 *
 * - All responses pass typia.assert().
 * - Data arrays are empty; records=0; pages=0.
 * - Limit echoes request; current is consistent (0- or 1-based allowed for page
 *   1).
 */
export async function test_api_ip_rate_counters_by_policy_pagination_and_sorting_defaults(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(adminAuth);

  // 2) Create a rate limit policy (scope: ip)
  const policy: ITodoAppRateLimit =
    await api.functional.todoApp.systemAdmin.rateLimits.create(connection, {
      body: {
        code: `ip_${RandomGenerator.alphaNumeric(8)}`,
        name: `IP Policy ${RandomGenerator.name(1)}`,
        description: RandomGenerator.paragraph({ sentences: 5 }),
        scope: "ip",
        category: "read",
        window_seconds: 60,
        max_requests: 100,
        burst_size: null,
        sliding_window: false,
        enabled: true,
      } satisfies ITodoAppRateLimit.ICreate,
    });
  typia.assert(policy);

  // 3) Query counters with explicit pagination and sorting
  const page = 1;
  const limit = 20;
  const first: IPageITodoAppIpRateCounter.ISummary =
    await api.functional.todoApp.systemAdmin.rateLimits.ipRateCounters.index(
      connection,
      {
        rateLimitId: policy.id,
        body: {
          page,
          limit,
          todo_app_rate_limit_id: policy.id,
          sort: "last_action_at desc",
        } satisfies ITodoAppIpRateCounter.IRequest,
      },
    );
  typia.assert(first);

  // Basic empty-state validations
  TestValidator.equals("first.data is empty", first.data.length, 0);
  TestValidator.equals("first.records is zero", first.pagination.records, 0);
  TestValidator.equals("first.pages is zero", first.pagination.pages, 0);
  TestValidator.equals(
    "first.limit echoes requested",
    first.pagination.limit,
    limit,
  );
  TestValidator.predicate(
    "first.current is 0-based or matches requested page",
    first.pagination.current === 0 || first.pagination.current === page,
  );

  // 4) Query again without sort (default sorting) to ensure stability
  const second: IPageITodoAppIpRateCounter.ISummary =
    await api.functional.todoApp.systemAdmin.rateLimits.ipRateCounters.index(
      connection,
      {
        rateLimitId: policy.id,
        body: {
          page,
          limit,
          todo_app_rate_limit_id: policy.id,
        } satisfies ITodoAppIpRateCounter.IRequest,
      },
    );
  typia.assert(second);

  // Same empty-state validations for default sort
  TestValidator.equals("second.data is empty", second.data.length, 0);
  TestValidator.equals("second.records is zero", second.pagination.records, 0);
  TestValidator.equals("second.pages is zero", second.pagination.pages, 0);
  TestValidator.equals(
    "second.limit echoes requested",
    second.pagination.limit,
    limit,
  );
  TestValidator.predicate(
    "second.current is 0-based or matches requested page",
    second.pagination.current === 0 || second.pagination.current === page,
  );
}
