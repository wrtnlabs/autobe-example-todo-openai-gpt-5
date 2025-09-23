import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { EOrderByITodoAppKpiCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/EOrderByITodoAppKpiCounter";
import type { EOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/EOrderDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppKpiCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppKpiCounter";
import type { ITodoAppKpiCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppKpiCounter";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

export async function test_api_kpi_counters_pagination_window_filters(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: typia.random<ITodoAppSystemAdminJoin.ICreate>(),
    });
  typia.assert(admin);

  // Helper: date utilities
  const now = new Date();
  const msDay = 24 * 60 * 60 * 1000;
  const recentStartIso = new Date(now.getTime() - 30 * msDay).toISOString();
  const recentEndIso = now.toISOString();

  const orderBy: EOrderByITodoAppKpiCounter = "window_end";
  const orderDir: EOrderDirection = "desc";
  const limit = 10;

  const byWindowEndDesc = (a: ITodoAppKpiCounter, b: ITodoAppKpiCounter) =>
    a.window_end < b.window_end ? 1 : a.window_end > b.window_end ? -1 : 0;

  // 2) Success path: window range + pagination + ordering
  const page1: IPageITodoAppKpiCounter =
    await api.functional.todoApp.systemAdmin.kpiCounters.index(connection, {
      body: {
        page: 1,
        limit,
        window_end_from: recentStartIso,
        window_end_to: recentEndIso,
        order_by: orderBy,
        order_dir: orderDir,
      } satisfies ITodoAppKpiCounter.IRequest,
    });
  typia.assert(page1);

  // Validate: sorting by window_end desc
  const sortedPage1Ids = [...page1.data].sort(byWindowEndDesc).map((x) => x.id);
  TestValidator.equals(
    "page1 sorted by window_end desc",
    page1.data.map((x) => x.id),
    sortedPage1Ids,
  );

  // Validate: items within the requested window
  await ArrayUtil.asyncForEach(page1.data, async (item) => {
    TestValidator.predicate(
      "page1 item.window_end within [recentStartIso,recentEndIso]",
      item.window_end >= recentStartIso && item.window_end <= recentEndIso,
    );
  });

  // 3) Pagination correctness across pages
  if (page1.pagination.pages > 1) {
    const page2: IPageITodoAppKpiCounter =
      await api.functional.todoApp.systemAdmin.kpiCounters.index(connection, {
        body: {
          page: 2,
          limit,
          window_end_from: recentStartIso,
          window_end_to: recentEndIso,
          order_by: orderBy,
          order_dir: orderDir,
        } satisfies ITodoAppKpiCounter.IRequest,
      });
    typia.assert(page2);

    // No overlap of IDs between page1 and page2
    const ids1 = page1.data.map((d) => d.id);
    const ids2 = page2.data.map((d) => d.id);
    const overlap = ids2.filter((id) => ids1.includes(id));
    TestValidator.equals(
      "no overlap between page1 and page2",
      overlap.length,
      0,
    );

    const sortedPage2Ids = [...page2.data]
      .sort(byWindowEndDesc)
      .map((x) => x.id);
    TestValidator.equals(
      "page2 sorted by window_end desc",
      ids2,
      sortedPage2Ids,
    );
  }

  // 4) Narrow future filter (likely empty). Validate consistency either way.
  const futureStartIso = new Date(now.getTime() + 365 * msDay).toISOString();
  const futureEndIso = new Date(now.getTime() + 366 * msDay).toISOString();

  const narrow: IPageITodoAppKpiCounter =
    await api.functional.todoApp.systemAdmin.kpiCounters.index(connection, {
      body: {
        page: 1,
        limit: 5,
        window_end_from: futureStartIso,
        window_end_to: futureEndIso,
        order_by: orderBy,
        order_dir: orderDir,
      } satisfies ITodoAppKpiCounter.IRequest,
    });
  typia.assert(narrow);

  if (narrow.pagination.records === 0) {
    TestValidator.equals(
      "empty result set has empty data array",
      narrow.data.length,
      0,
    );
  } else {
    await ArrayUtil.asyncForEach(narrow.data, async (item) => {
      TestValidator.predicate(
        "future window item within [futureStartIso,futureEndIso]",
        item.window_end >= futureStartIso && item.window_end <= futureEndIso,
      );
    });
  }

  // 5) Error handling: invalid window (from > to)
  await TestValidator.error("invalid window range should error", async () => {
    await api.functional.todoApp.systemAdmin.kpiCounters.index(connection, {
      body: {
        page: 1,
        limit: 10,
        window_end_from: recentEndIso,
        window_end_to: recentStartIso, // reversed
        order_by: orderBy,
        order_dir: orderDir,
      } satisfies ITodoAppKpiCounter.IRequest,
    });
  });

  // 5-2) Error handling: out-of-range page size (0)
  await TestValidator.error("limit below minimum should error", async () => {
    await api.functional.todoApp.systemAdmin.kpiCounters.index(connection, {
      body: {
        page: 1,
        limit: 0,
      } satisfies ITodoAppKpiCounter.IRequest,
    });
  });

  // 5-3) Error handling: out-of-range page size (>100)
  await TestValidator.error("limit above maximum should error", async () => {
    await api.functional.todoApp.systemAdmin.kpiCounters.index(connection, {
      body: {
        page: 1,
        limit: 101,
      } satisfies ITodoAppKpiCounter.IRequest,
    });
  });
}
