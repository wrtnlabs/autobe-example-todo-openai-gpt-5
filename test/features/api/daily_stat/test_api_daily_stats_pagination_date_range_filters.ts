import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppDailyStat } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppDailyStat";
import type { ITodoAppDailyStat } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppDailyStat";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Validate admin daily stats search: pagination, default sorting, date
 * filtering, and error handling.
 *
 * Steps
 *
 * 1. Join as systemAdmin (authorization handled by SDK).
 * 2. Success: query page=1, limit=5 for last 7 days with default sort.
 *
 *    - Validate pagination.limit equals requested limit and data length ≤ limit.
 *    - Validate default sort: stats_date in non-increasing order.
 * 3. Pagination: query page=2 with identical filters and validate no overlap with
 *    page 1.
 * 4. Filtering: construct a future-only tight window (based on latest page-1
 *    stats_date if exists; otherwise far-future) and expect empty results.
 * 5. Errors: invalid range (from > to) and out-of-bounds limits (0, 101) must
 *    throw.
 */
export async function test_api_daily_stats_pagination_date_range_filters(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: adminJoinBody,
    });
  typia.assert(adminAuth);

  // 2) Success path: list daily stats for last 7 days, page=1, limit=5
  const now = new Date();
  const sevenDaysAgoISO = new Date(
    now.getTime() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const nowISO = now.toISOString();

  const requestPage1 = {
    page: 1,
    limit: 5,
    stats_date_from: sevenDaysAgoISO,
    stats_date_to: nowISO,
    // sort omitted to verify default sort behavior
  } satisfies ITodoAppDailyStat.IRequest;

  const page1 = await api.functional.todoApp.systemAdmin.dailyStats.index(
    connection,
    { body: requestPage1 },
  );
  typia.assert(page1);

  // Validate: limit echoes requested and data length ≤ limit
  TestValidator.equals(
    "page 1: pagination.limit equals requested limit",
    page1.pagination.limit,
    requestPage1.limit,
  );
  TestValidator.predicate(
    "page 1: data length does not exceed limit",
    page1.data.length <= (requestPage1.limit ?? 0),
  );

  // Validate: default sort (stats_date desc) if at least two rows
  if (page1.data.length >= 2) {
    const isDesc = page1.data.every(
      (cur, i, arr) =>
        i === 0 ||
        new Date(arr[i - 1].stats_date).getTime() >=
          new Date(cur.stats_date).getTime(),
    );
    TestValidator.predicate(
      "default sorting should be stats_date descending on page 1",
      isDesc,
    );
  }

  // 3) Pagination integrity: fetch page=2 with same filters and ensure no overlap
  const requestPage2 = {
    page: 2,
    limit: requestPage1.limit,
    stats_date_from: requestPage1.stats_date_from,
    stats_date_to: requestPage1.stats_date_to,
  } satisfies ITodoAppDailyStat.IRequest;
  const page2 = await api.functional.todoApp.systemAdmin.dailyStats.index(
    connection,
    { body: requestPage2 },
  );
  typia.assert(page2);

  const ids1 = page1.data.map((d) => d.id);
  const ids2 = page2.data.map((d) => d.id);
  const hasOverlap = ids1.some((id) => ids2.includes(id));
  TestValidator.predicate(
    "no overlap between page 1 and page 2 results",
    hasOverlap === false,
  );
  // Also validate page 2 size respect limit
  TestValidator.predicate(
    "page 2: data length does not exceed limit",
    page2.data.length <= (requestPage2.limit ?? 0),
  );

  // 4) Filtering correctness: tight future window beyond latest stats_date → expect empty
  const baseForFuture =
    page1.data.length > 0 ? page1.data[0].stats_date : nowISO;
  const futureFromISO = new Date(
    new Date(baseForFuture).getTime() + 24 * 60 * 60 * 1000,
  ).toISOString();
  const futureToISO = new Date(
    new Date(baseForFuture).getTime() + 2 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const futureWindowReq = {
    page: 1,
    limit: requestPage1.limit,
    stats_date_from: futureFromISO,
    stats_date_to: futureToISO,
  } satisfies ITodoAppDailyStat.IRequest;
  const emptyPage = await api.functional.todoApp.systemAdmin.dailyStats.index(
    connection,
    { body: futureWindowReq },
  );
  typia.assert(emptyPage);
  TestValidator.equals(
    "future tight window should return empty data",
    emptyPage.data.length,
    0,
  );

  // 5) Error handling: invalid date window (from > to)
  const invalidWindowReq = {
    page: 1,
    limit: requestPage1.limit,
    stats_date_from: futureToISO,
    stats_date_to: futureFromISO, // intentionally reversed
  } satisfies ITodoAppDailyStat.IRequest;
  await TestValidator.error(
    "invalid date window (from > to) should fail",
    async () => {
      await api.functional.todoApp.systemAdmin.dailyStats.index(connection, {
        body: invalidWindowReq,
      });
    },
  );

  // 6) Error handling: out-of-bounds limit values
  const zeroLimitReq = {
    page: 1,
    limit: 0, // below minimum 1
    stats_date_from: requestPage1.stats_date_from,
    stats_date_to: requestPage1.stats_date_to,
  } satisfies ITodoAppDailyStat.IRequest;
  await TestValidator.error("limit=0 should fail (below minimum)", async () => {
    await api.functional.todoApp.systemAdmin.dailyStats.index(connection, {
      body: zeroLimitReq,
    });
  });

  const overLimitReq = {
    page: 1,
    limit: 101, // above maximum 100
    stats_date_from: requestPage1.stats_date_from,
    stats_date_to: requestPage1.stats_date_to,
  } satisfies ITodoAppDailyStat.IRequest;
  await TestValidator.error(
    "limit=101 should fail (above maximum)",
    async () => {
      await api.functional.todoApp.systemAdmin.dailyStats.index(connection, {
        body: overLimitReq,
      });
    },
  );
}
