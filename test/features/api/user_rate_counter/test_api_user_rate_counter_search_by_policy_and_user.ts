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
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppUserRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserRateCounter";

/**
 * Search user rate counters by policy and user as systemAdmin with pagination
 * and sorting.
 *
 * Business flow:
 *
 * 1. Join as systemAdmin (Admin A) to get admin token
 * 2. Create a rate limit policy (scope: "user", category: "auth")
 * 3. Join as todoUser (User U)
 * 4. Switch back to systemAdmin by joining a second admin (Admin B)
 * 5. Search user rate counters filtered by the created policy and user, with
 *    pagination and sorting
 * 6. Validate results: types, filters applied, ordering
 * 7. Query with blocked_only=true and validate when results exist
 * 8. Verify unauthorized access is rejected using an unauthenticated connection
 */
export async function test_api_user_rate_counter_search_by_policy_and_user(
  connection: api.IConnection,
) {
  // 1) Admin A joins
  const adminAEmail = typia.random<string & tags.Format<"email">>();
  const adminAPassword = RandomGenerator.alphaNumeric(12);
  const adminA = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: adminAEmail,
      password: adminAPassword,
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(adminA);

  // 2) Create a rate limit policy (user scope, auth category)
  const policy = await api.functional.todoApp.systemAdmin.rateLimits.create(
    connection,
    {
      body: {
        code: `auth_user_${RandomGenerator.alphaNumeric(8)}`,
        name: `Auth User ${RandomGenerator.name(1)}`,
        description: null,
        scope: "user",
        category: "auth",
        window_seconds: 60,
        max_requests: 5,
        burst_size: null,
        sliding_window: false,
        enabled: true,
      } satisfies ITodoAppRateLimit.ICreate,
    },
  );
  typia.assert(policy);

  // 3) Create a member user (U) - this switches connection token to todoUser
  const userEmail = typia.random<string & tags.Format<"email">>();
  const userPassword = RandomGenerator.alphaNumeric(12);
  const userAuth = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: userEmail,
      password: userPassword,
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(userAuth);

  // 4) Switch back to systemAdmin by joining another admin (Admin B)
  const adminBEmail = typia.random<string & tags.Format<"email">>();
  const adminBPassword = RandomGenerator.alphaNumeric(12);
  const adminB = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: adminBEmail,
      password: adminBPassword,
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(adminB);

  // 5) Search with filters: policy + user, sorted by window_started_at desc
  const request1 = {
    page: 1,
    limit: 20,
    todo_app_rate_limit_id: policy.id,
    todo_app_user_id: userAuth.id,
    order_by: "window_started_at",
    order_dir: "desc",
  } satisfies ITodoAppUserRateCounter.IRequest;

  const page1 = await api.functional.todoApp.systemAdmin.userRateCounters.index(
    connection,
    { body: request1 },
  );
  typia.assert(page1);

  // 6) Validate results
  TestValidator.predicate(
    "pagination structure exists",
    page1.pagination.current >= 0 &&
      page1.pagination.limit >= 0 &&
      page1.pagination.pages >= 0 &&
      page1.pagination.records >= 0,
  );

  if (page1.data.length > 0) {
    // All items match filters
    TestValidator.predicate(
      "every item matches rate limit policy filter",
      page1.data.every((r) => r.todo_app_rate_limit_id === policy.id),
    );
    TestValidator.predicate(
      "every item matches user filter",
      page1.data.every((r) => r.todo_app_user_id === userAuth.id),
    );
    // Ordering by window_started_at desc (use Date for robust comparison)
    if (page1.data.length >= 2) {
      const ordered = page1.data.every(
        (r, i, arr) =>
          i === 0 ||
          new Date(arr[i - 1].window_started_at) >=
            new Date(r.window_started_at),
      );
      TestValidator.predicate(
        "results are ordered by window_started_at desc",
        ordered,
      );
    }
  }

  // 7) blocked_only query
  const now = new Date();
  const requestBlocked = {
    page: 1,
    limit: 20,
    todo_app_rate_limit_id: policy.id,
    todo_app_user_id: userAuth.id,
    blocked_only: true,
    order_by: "window_started_at",
    order_dir: "desc",
  } satisfies ITodoAppUserRateCounter.IRequest;

  const pageBlocked =
    await api.functional.todoApp.systemAdmin.userRateCounters.index(
      connection,
      { body: requestBlocked },
    );
  typia.assert(pageBlocked);

  if (pageBlocked.data.length > 0) {
    TestValidator.predicate(
      "every blocked-only item has future blocked_until",
      pageBlocked.data.every(
        (r) =>
          r.blocked_until !== null &&
          r.blocked_until !== undefined &&
          new Date(r.blocked_until) > now,
      ),
    );
    if (pageBlocked.data.length >= 2) {
      const orderedBlocked = pageBlocked.data.every(
        (r, i, arr) =>
          i === 0 ||
          new Date(arr[i - 1].window_started_at) >=
            new Date(r.window_started_at),
      );
      TestValidator.predicate(
        "blocked-only results are ordered by window_started_at desc",
        orderedBlocked,
      );
    }
  }

  // 8) Unauthorized access should error (using unauthenticated connection)
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated request to admin search must be rejected",
    async () => {
      await api.functional.todoApp.systemAdmin.userRateCounters.index(
        unauthConn,
        { body: request1 },
      );
    },
  );
}
