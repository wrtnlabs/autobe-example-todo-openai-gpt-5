import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppIpRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppIpRateCounter";
import type { ITodoAppIpRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppIpRateCounter";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Non-existent policy ID returns an empty IP rate counters page.
 *
 * Validates that systemAdmin listing of IP rate counters constrained by a
 * non-existent rate limit policy returns an empty page without error.
 *
 * Steps:
 *
 * 1. Authenticate as systemAdmin via join
 * 2. Call listing with a random UUID as rateLimitId (assumed to be non-existent)
 * 3. Validate response type and that page is empty with proper pagination
 */
export async function test_api_ip_rate_counters_by_policy_nonexistent_policy_returns_empty_page(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: typia.random<ITodoAppSystemAdminJoin.ICreate>(),
  });
  typia.assert(admin);

  // 2) Call listing with a non-existent rateLimitId
  const unknownPolicyId = typia.random<string & tags.Format<"uuid">>();
  const page =
    await api.functional.todoApp.systemAdmin.rateLimits.ipRateCounters.index(
      connection,
      {
        rateLimitId: unknownPolicyId,
        body: {} satisfies ITodoAppIpRateCounter.IRequest,
      },
    );
  typia.assert(page);

  // 3) Validate empty page and pagination invariants
  TestValidator.equals(
    "ipRateCounters list should be empty for unknown policy",
    page.data.length,
    0,
  );
  TestValidator.equals(
    "records should be zero for unknown policy",
    page.pagination.records,
    0,
  );
  TestValidator.equals(
    "pages should be zero when no records exist",
    page.pagination.pages,
    0,
  );
  TestValidator.predicate(
    "pagination current is non-negative",
    page.pagination.current >= 0,
  );
  TestValidator.predicate(
    "pagination limit is non-negative",
    page.pagination.limit >= 0,
  );
  TestValidator.predicate(
    "data length does not exceed limit",
    page.data.length <= page.pagination.limit,
  );
}
