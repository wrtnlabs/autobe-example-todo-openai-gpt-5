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
 * List IP rate counters for a newly created policy and expect empty results.
 *
 * Business context:
 *
 * - System admin creates a fresh rate limit policy scoped to "ip".
 * - Immediately listing IP rate counters for that policy should return no rows
 *   because no traffic has occurred yet.
 *
 * Steps:
 *
 * 1. Join as systemAdmin to get authorized session.
 * 2. Create a rate limit policy (scope: "ip").
 * 3. List ipRateCounters for the created policy with default pagination.
 * 4. Validate empty data set and consistent pagination metadata.
 */
export async function test_api_ip_rate_counters_by_policy_empty_result_when_policy_exists(
  connection: api.IConnection,
) {
  // 1) Authenticate (join) as systemAdmin
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: typia.random<
          string & tags.MinLength<8> & tags.MaxLength<64>
        >(),
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(admin);

  // 2) Create a new rate limit policy scoped to IP
  const createPolicyBody = {
    code: `ip_rl_${RandomGenerator.alphaNumeric(12)}`,
    name: `IP Policy ${RandomGenerator.alphaNumeric(8)}`,
    description: null,
    scope: "ip",
    category: "auth",
    window_seconds: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<1>
    >(),
    max_requests: typia.random<number & tags.Type<"int32"> & tags.Minimum<1>>(),
    burst_size: null,
    sliding_window: false,
    enabled: true,
  } satisfies ITodoAppRateLimit.ICreate;
  const policy: ITodoAppRateLimit =
    await api.functional.todoApp.systemAdmin.rateLimits.create(connection, {
      body: createPolicyBody,
    });
  typia.assert(policy);

  // 3) List IP rate counters for the created policy with minimal/default request
  const page =
    await api.functional.todoApp.systemAdmin.rateLimits.ipRateCounters.index(
      connection,
      {
        rateLimitId: policy.id,
        body: {} satisfies ITodoAppIpRateCounter.IRequest,
      },
    );
  typia.assert(page);

  // 4) Assertions: empty dataset and sane pagination metadata
  TestValidator.equals(
    "no counters returned for a newly created policy",
    page.data.length,
    0,
  );
  TestValidator.equals(
    "pagination records should be zero for empty dataset",
    page.pagination.records,
    0,
  );
  TestValidator.predicate(
    "current page index should be non-negative",
    page.pagination.current >= 0,
  );
  TestValidator.predicate(
    "total pages should be non-negative",
    page.pagination.pages >= 0,
  );

  // Defensive scope validation: if any data unexpectedly exists, it must match the policy id
  TestValidator.predicate(
    "all returned items (if any) belong to created policy",
    !ArrayUtil.has(page.data, (r) => r.todo_app_rate_limit_id !== policy.id),
  );
}
