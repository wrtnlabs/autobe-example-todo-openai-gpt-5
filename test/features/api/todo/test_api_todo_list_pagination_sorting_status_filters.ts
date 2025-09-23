import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppTodo";
import type { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_todo_list_pagination_sorting_status_filters(
  connection: api.IConnection,
) {
  // 1) Join as a todoUser (auth token handled by SDK)
  const auth = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(auth);

  // Helpers
  const isIsoAfterOrEqual = (a: string, b: string): boolean => a >= b; // ISO-8601 lexicographic order equals chronological
  const ids = (arr: { id: string }[]) => arr.map((x) => x.id);

  // 2) Create multiple Todos (>=6) with varied due_at values (some null)
  const TOTAL: number = 6;
  const created = await ArrayUtil.asyncRepeat<ITodoAppTodo>(
    TOTAL,
    async (i) => {
      const hasDue = i % 2 === 0; // alternate due_at presence
      const due = hasDue
        ? RandomGenerator.date(
            new Date(),
            1000 * 60 * 60 * 24 * 30,
          ).toISOString()
        : null;

      const todo = await api.functional.todoApp.todoUser.todos.create(
        connection,
        {
          body: {
            title: RandomGenerator.paragraph({ sentences: 3 }),
            description: RandomGenerator.paragraph({ sentences: 6 }),
            due_at: due,
          } satisfies ITodoAppTodo.ICreate,
        },
      );
      typia.assert(todo);
      return todo;
    },
  );

  // 3) Mark a subset as completed (first two)
  const completeTargets = created.slice(0, 2);
  for (const t of completeTargets) {
    const updated = await api.functional.todoApp.todoUser.todos.update(
      connection,
      {
        todoId: t.id,
        body: { status: "completed" } satisfies ITodoAppTodo.IUpdate,
      },
    );
    typia.assert(updated);
  }

  // 4-a) Default listing (no parameters) → default sort by created_at desc
  const defaultPage = await api.functional.todoApp.todoUser.todos.index(
    connection,
    {
      body: {} satisfies ITodoAppTodo.IRequest,
    },
  );
  typia.assert(defaultPage);

  const defaultData = defaultPage.data;
  for (let i = 1; i < defaultData.length; i++) {
    TestValidator.predicate(
      `default sort by created_at desc at index ${i}`,
      isIsoAfterOrEqual(
        defaultData[i - 1].created_at,
        defaultData[i].created_at,
      ),
    );
  }

  // 4-b) Status filters: open/completed and cross-check records counts
  const allRes = await api.functional.todoApp.todoUser.todos.index(connection, {
    body: { status: "all" } satisfies ITodoAppTodo.IRequest,
  });
  typia.assert(allRes);

  const openRes = await api.functional.todoApp.todoUser.todos.index(
    connection,
    {
      body: { status: "open" } satisfies ITodoAppTodo.IRequest,
    },
  );
  typia.assert(openRes);

  const completedRes = await api.functional.todoApp.todoUser.todos.index(
    connection,
    {
      body: { status: "completed" } satisfies ITodoAppTodo.IRequest,
    },
  );
  typia.assert(completedRes);

  // Check that every item matches requested status
  for (const s of openRes.data) {
    TestValidator.equals(
      "open filter returns only open items",
      s.status,
      "open",
    );
  }
  for (const s of completedRes.data) {
    TestValidator.equals(
      "completed filter returns only completed items",
      s.status,
      "completed",
    );
  }

  // Verify records accounting
  TestValidator.equals(
    "open + completed records equals all records",
    openRes.pagination.records + completedRes.pagination.records,
    allRes.pagination.records,
  );

  // Ensure we actually created some completed items
  TestValidator.predicate(
    "at least two completed items exist",
    completedRes.pagination.records >= 2,
  );

  // 4-c) Pagination: page=1,size=2 and page=2,size=2; non-overlap and coverage
  const baseline = await api.functional.todoApp.todoUser.todos.index(
    connection,
    {
      body: {
        status: "all",
        page: 1,
        limit: 4,
        sort: "created_at",
        direction: "desc",
      } satisfies ITodoAppTodo.IRequest,
    },
  );
  typia.assert(baseline);

  const page1 = await api.functional.todoApp.todoUser.todos.index(connection, {
    body: {
      status: "all",
      page: 1,
      limit: 2,
      sort: "created_at",
      direction: "desc",
    } satisfies ITodoAppTodo.IRequest,
  });
  typia.assert(page1);

  const page2 = await api.functional.todoApp.todoUser.todos.index(connection, {
    body: {
      status: "all",
      page: 2,
      limit: 2,
      sort: "created_at",
      direction: "desc",
    } satisfies ITodoAppTodo.IRequest,
  });
  typia.assert(page2);

  TestValidator.equals("page1 limit honored", page1.pagination.limit, 2);
  TestValidator.equals("page2 limit honored", page2.pagination.limit, 2);

  // Non-overlapping IDs
  const ids1 = new Set(ids(page1.data));
  const ids2 = new Set(ids(page2.data));
  const hasOverlap = Array.from(ids1).some((id) => ids2.has(id));
  TestValidator.predicate("page1 and page2 do not overlap", !hasOverlap);

  // Coverage equals baseline first 4 items
  const merged = [...page1.data, ...page2.data];
  const mergedIds = ids(merged);
  const baselineIds = ids(baseline.data);
  TestValidator.equals(
    "first 4 items equal page1+page2 items",
    mergedIds,
    baselineIds,
  );

  // 4-d) Sorting by due_at asc with nulls last
  const byDueAsc = await api.functional.todoApp.todoUser.todos.index(
    connection,
    {
      body: {
        status: "all",
        sort: "due_at",
        direction: "asc",
        limit: 50,
      } satisfies ITodoAppTodo.IRequest,
    },
  );
  typia.assert(byDueAsc);

  const dueData = byDueAsc.data;
  // Find first null/undefined due_at index (if any)
  let firstNullIdx: number = -1;
  for (let i = 0; i < dueData.length; i++) {
    if (dueData[i].due_at === null || dueData[i].due_at === undefined) {
      firstNullIdx = i;
      break;
    }
  }
  // All non-null due_ats must come before any null
  if (firstNullIdx !== -1) {
    for (let i = firstNullIdx; i < dueData.length; i++) {
      TestValidator.predicate(
        "null due_at appears only after all non-null entries",
        dueData[i].due_at === null || dueData[i].due_at === undefined,
      );
    }
  }
  // Within non-null segment, ensure ascending order
  const endIdx = firstNullIdx === -1 ? dueData.length : firstNullIdx;
  for (let i = 1; i < endIdx; i++) {
    const prev = dueData[i - 1].due_at!;
    const curr = dueData[i].due_at!;
    TestValidator.predicate(
      `due_at asc within non-null segment at index ${i}`,
      prev <= curr,
    );
  }

  // 5) Error: out-of-range page size (>100)
  await TestValidator.error("limit over 100 should be rejected", async () => {
    await api.functional.todoApp.todoUser.todos.index(connection, {
      body: { limit: 101 } satisfies ITodoAppTodo.IRequest,
    });
  });
}
