import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppTodo";
import type { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_todo_list_keyword_search_due_windows(
  connection: api.IConnection,
) {
  /**
   * Validate keyword search and KST-based due-window filters.
   *
   * Steps:
   *
   * 1. Join as a todoUser (auth context established by SDK).
   * 2. Create Todos covering keywords and due windows:
   *
   *    - Alpha in title: overdue/today/future
   *    - Alpha only in description (title lacks keyword)
   *    - Controls: BETA (non-matching keyword), GAMMA (no keyword, no due_at)
   * 3. Compute Asia/Seoul (KST) boundaries for today and assign due_at
   *    accordingly.
   * 4. Validate search "alpha" includes title and description matches
   *    (case-insensitive) and excludes controls.
   * 5. Validate due_filter (overdue/today/future) combined with search partitions
   *    results as expected.
   * 6. Validate intersection with status=open works with due_filter today +
   *    search.
   */

  // 1) Authenticate: join a new todoUser
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: "Password#123", // 8-64 chars per policy
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authorized);

  // 2) KST boundaries & representative instants
  const KST_MS = 9 * 60 * 60 * 1000; // UTC+09:00
  const now = new Date();
  const kstNow = new Date(now.getTime() + KST_MS);
  const startOfKstDayUtcMs =
    Date.UTC(
      kstNow.getUTCFullYear(),
      kstNow.getUTCMonth(),
      kstNow.getUTCDate(),
      0,
      0,
      0,
      0,
    ) - KST_MS; // 00:00 (KST) expressed in UTC
  const endOfKstDayUtcMs = startOfKstDayUtcMs + 24 * 60 * 60 * 1000; // +24h
  const overdueAtIso = new Date(
    startOfKstDayUtcMs - 60 * 60 * 1000,
  ).toISOString(); // 1h before today start (KST)
  const todayMidIso = new Date(
    startOfKstDayUtcMs + 12 * 60 * 60 * 1000,
  ).toISOString(); // Midday today (KST)
  const futureIso = new Date(
    endOfKstDayUtcMs + 12 * 60 * 60 * 1000,
  ).toISOString(); // Tomorrow + 12h (KST)

  // 3) Create dataset
  const alphaOverdue = await api.functional.todoApp.todoUser.todos.create(
    connection,
    {
      body: {
        title: "Project Alpha kickoff",
        description: RandomGenerator.paragraph({ sentences: 6 }),
        due_at: overdueAtIso,
      } satisfies ITodoAppTodo.ICreate,
    },
  );
  typia.assert(alphaOverdue);

  const alphaToday = await api.functional.todoApp.todoUser.todos.create(
    connection,
    {
      body: {
        title: "alpha follow-up",
        description: RandomGenerator.paragraph({ sentences: 6 }),
        due_at: todayMidIso,
      } satisfies ITodoAppTodo.ICreate,
    },
  );
  typia.assert(alphaToday);

  const alphaFuture = await api.functional.todoApp.todoUser.todos.create(
    connection,
    {
      body: {
        title: "ALPHA retrospective",
        description: RandomGenerator.paragraph({ sentences: 6 }),
        due_at: futureIso,
      } satisfies ITodoAppTodo.ICreate,
    },
  );
  typia.assert(alphaFuture);

  const betaItem = await api.functional.todoApp.todoUser.todos.create(
    connection,
    {
      body: {
        title: "BETA meeting",
        description: RandomGenerator.paragraph({ sentences: 5 }),
        due_at: futureIso,
      } satisfies ITodoAppTodo.ICreate,
    },
  );
  typia.assert(betaItem);

  const gammaNoDue = await api.functional.todoApp.todoUser.todos.create(
    connection,
    {
      body: {
        title: "GAMMA task",
        description: RandomGenerator.paragraph({ sentences: 4 }),
      } satisfies ITodoAppTodo.ICreate,
    },
  );
  typia.assert(gammaNoDue);

  const descAlphaToday = await api.functional.todoApp.todoUser.todos.create(
    connection,
    {
      body: {
        title: "Refactoring task",
        description: `Notes: Alpha details and checklist. ${RandomGenerator.paragraph({ sentences: 5 })}`,
        due_at: todayMidIso,
      } satisfies ITodoAppTodo.ICreate,
    },
  );
  typia.assert(descAlphaToday);

  // Utility: make a Set of IDs from page result
  const toIdSet = (page: IPageITodoAppTodo.ISummary): Set<string> =>
    new Set(page.data.map((s) => s.id));

  // 4) Keyword search: "alpha"
  const searchAlphaPage = await api.functional.todoApp.todoUser.todos.index(
    connection,
    {
      body: {
        page: 1,
        limit: 100,
        search: "alpha",
      } satisfies ITodoAppTodo.IRequest,
    },
  );
  typia.assert(searchAlphaPage);
  const searchIds = toIdSet(searchAlphaPage);

  TestValidator.predicate(
    "keyword search includes title 'Project Alpha kickoff' (overdue)",
    searchIds.has(alphaOverdue.id),
  );
  TestValidator.predicate(
    "keyword search includes title 'alpha follow-up' (today)",
    searchIds.has(alphaToday.id),
  );
  TestValidator.predicate(
    "keyword search includes title 'ALPHA retrospective' (future, case-insensitive)",
    searchIds.has(alphaFuture.id),
  );
  TestValidator.predicate(
    "keyword search includes item where description contains 'Alpha'",
    searchIds.has(descAlphaToday.id),
  );
  TestValidator.predicate(
    "keyword search excludes 'BETA meeting'",
    !searchIds.has(betaItem.id),
  );
  TestValidator.predicate(
    "keyword search excludes unrelated 'GAMMA task' with no keyword",
    !searchIds.has(gammaNoDue.id),
  );

  // 5) Due-window: overdue + search alpha
  const overdueAlphaPage = await api.functional.todoApp.todoUser.todos.index(
    connection,
    {
      body: {
        page: 1,
        limit: 100,
        search: "alpha",
        due_filter: "overdue",
      } satisfies ITodoAppTodo.IRequest,
    },
  );
  typia.assert(overdueAlphaPage);
  const overdueIds = toIdSet(overdueAlphaPage);
  TestValidator.predicate(
    "overdue+search(alpha) contains overdue alpha title item and excludes others",
    overdueIds.has(alphaOverdue.id) &&
      !overdueIds.has(alphaToday.id) &&
      !overdueIds.has(alphaFuture.id) &&
      !overdueIds.has(betaItem.id) &&
      !overdueIds.has(gammaNoDue.id) &&
      !overdueIds.has(descAlphaToday.id), // desc item is today, not overdue
  );

  // 6) Due-window: today + search alpha
  const todayAlphaPage = await api.functional.todoApp.todoUser.todos.index(
    connection,
    {
      body: {
        page: 1,
        limit: 100,
        search: "alpha",
        due_filter: "today",
      } satisfies ITodoAppTodo.IRequest,
    },
  );
  typia.assert(todayAlphaPage);
  const todayIds = toIdSet(todayAlphaPage);
  TestValidator.predicate(
    "today+search(alpha) contains today's alpha items (title and description) and excludes others",
    todayIds.has(alphaToday.id) &&
      todayIds.has(descAlphaToday.id) &&
      !todayIds.has(alphaOverdue.id) &&
      !todayIds.has(alphaFuture.id) &&
      !todayIds.has(betaItem.id) &&
      !todayIds.has(gammaNoDue.id),
  );

  // 7) Due-window: future + search alpha
  const futureAlphaPage = await api.functional.todoApp.todoUser.todos.index(
    connection,
    {
      body: {
        page: 1,
        limit: 100,
        search: "alpha",
        due_filter: "future",
      } satisfies ITodoAppTodo.IRequest,
    },
  );
  typia.assert(futureAlphaPage);
  const futureIds = toIdSet(futureAlphaPage);
  TestValidator.predicate(
    "future+search(alpha) contains only future alpha title item and excludes others",
    futureIds.has(alphaFuture.id) &&
      !futureIds.has(alphaOverdue.id) &&
      !futureIds.has(alphaToday.id) &&
      !futureIds.has(descAlphaToday.id) &&
      !futureIds.has(betaItem.id) &&
      !futureIds.has(gammaNoDue.id),
  );

  // 8) Intersection: status=open + today + search alpha
  const todayOpenAlphaPage = await api.functional.todoApp.todoUser.todos.index(
    connection,
    {
      body: {
        page: 1,
        limit: 100,
        search: "alpha",
        status: "open",
        due_filter: "today",
      } satisfies ITodoAppTodo.IRequest,
    },
  );
  typia.assert(todayOpenAlphaPage);
  const todayOpenIds = toIdSet(todayOpenAlphaPage);
  TestValidator.predicate(
    "today+open+search(alpha) matches today's alpha items only",
    todayOpenIds.has(alphaToday.id) &&
      todayOpenIds.has(descAlphaToday.id) &&
      !todayOpenIds.has(alphaOverdue.id) &&
      !todayOpenIds.has(alphaFuture.id) &&
      !todayOpenIds.has(betaItem.id) &&
      !todayOpenIds.has(gammaNoDue.id),
  );
}
