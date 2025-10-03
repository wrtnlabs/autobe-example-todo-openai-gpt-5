import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { IESortOrder } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortOrder";
import type { IETodoMvpTodoSortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IETodoMvpTodoSortBy";
import type { IETodoMvpTodoStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IETodoMvpTodoStatus";
import type { IETodoMvpTodoStatusFilter } from "@ORGANIZATION/PROJECT-api/lib/structures/IETodoMvpTodoStatusFilter";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoMvpTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoMvpTodo";
import type { ITodoMvpTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpTodo";
import type { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";

export async function test_api_todo_list_status_filter_and_ownership(
  connection: api.IConnection,
) {
  /**
   * Validate ownership isolation and status filtering for Todo list/search.
   *
   * Steps:
   *
   * 1. Create two isolated connections (A, B), then join both users.
   * 2. On A: create A1, A2; mark A2 as completed.
   * 3. On B: create B1 (open).
   * 4. From A: list with status all/open/completed and validate contents and
   *    structure.
   */
  // 1) Create separate connection objects so that tokens do not interfere
  const connA: api.IConnection = { ...connection, headers: {} };
  const connB: api.IConnection = { ...connection, headers: {} };

  // Join User A
  const joinABody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoMvpUser.ICreate;
  const authA: ITodoMvpUser.IAuthorized = await api.functional.auth.user.join(
    connA,
    { body: joinABody },
  );
  typia.assert(authA);

  // 2) Data setup for User A: create two todos
  const a1: ITodoMvpTodo = await api.functional.todoMvp.user.todos.create(
    connA,
    {
      body: {
        title: RandomGenerator.paragraph({ sentences: 3 }),
      } satisfies ITodoMvpTodo.ICreate,
    },
  );
  typia.assert(a1);

  const a2: ITodoMvpTodo = await api.functional.todoMvp.user.todos.create(
    connA,
    {
      body: {
        title: RandomGenerator.paragraph({ sentences: 3 }),
      } satisfies ITodoMvpTodo.ICreate,
    },
  );
  typia.assert(a2);

  // Mark A2 as completed and validate snapshot of fields
  const a2Completed: ITodoMvpTodo =
    await api.functional.todoMvp.user.todos.update(connA, {
      todoId: a2.id,
      body: {
        status: "completed",
      } satisfies ITodoMvpTodo.IUpdate,
    });
  typia.assert(a2Completed);
  TestValidator.equals(
    "A2 status becomes completed after update",
    a2Completed.status,
    "completed",
  );
  TestValidator.notEquals(
    "A2 updated_at changes after status update",
    a2Completed.updated_at,
    a2.updated_at,
  );
  TestValidator.predicate(
    "A2 completed_at is set when status is completed",
    a2Completed.completed_at !== null && a2Completed.completed_at !== undefined,
  );

  // 3) Data setup for User B
  const joinBBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoMvpUser.ICreate;
  const authB: ITodoMvpUser.IAuthorized = await api.functional.auth.user.join(
    connB,
    { body: joinBBody },
  );
  typia.assert(authB);

  const b1: ITodoMvpTodo = await api.functional.todoMvp.user.todos.create(
    connB,
    {
      body: {
        title: RandomGenerator.paragraph({ sentences: 3 }),
      } satisfies ITodoMvpTodo.ICreate,
    },
  );
  typia.assert(b1);

  // 4) Listing validations from User A context
  // all
  const pageAll = await api.functional.todoMvp.user.todos.patch(connA, {
    body: {
      status: "all",
      sort_by: "created_at",
      order: "desc",
    } satisfies ITodoMvpTodo.IRequest,
  });
  typia.assert(pageAll);
  const allIds = pageAll.data.map((s) => s.id);
  TestValidator.equals(
    "'all' listing includes A1",
    allIds.includes(a1.id),
    true,
  );
  TestValidator.equals(
    "'all' listing includes A2",
    allIds.includes(a2.id),
    true,
  );
  TestValidator.equals(
    "'all' listing excludes B1 (ownership isolation)",
    allIds.includes(b1.id),
    false,
  );

  // open
  const pageOpen = await api.functional.todoMvp.user.todos.patch(connA, {
    body: {
      status: "open",
    } satisfies ITodoMvpTodo.IRequest,
  });
  typia.assert(pageOpen);
  const openIds = pageOpen.data.map((s) => s.id);
  TestValidator.equals(
    "'open' listing includes A1",
    openIds.includes(a1.id),
    true,
  );
  TestValidator.equals(
    "'open' listing excludes A2 (now completed)",
    openIds.includes(a2.id),
    false,
  );
  TestValidator.equals(
    "'open' listing excludes B1 (ownership isolation)",
    openIds.includes(b1.id),
    false,
  );
  await TestValidator.predicate(
    "every item in 'open' listing has status open and no completed_at",
    async () =>
      pageOpen.data.every(
        (s) =>
          s.status === "open" &&
          (s.completed_at === null || s.completed_at === undefined),
      ),
  );

  // completed
  const pageCompleted = await api.functional.todoMvp.user.todos.patch(connA, {
    body: {
      status: "completed",
    } satisfies ITodoMvpTodo.IRequest,
  });
  typia.assert(pageCompleted);
  const completedIds = pageCompleted.data.map((s) => s.id);
  TestValidator.equals(
    "'completed' listing includes A2",
    completedIds.includes(a2.id),
    true,
  );
  TestValidator.equals(
    "'completed' listing excludes A1",
    completedIds.includes(a1.id),
    false,
  );
  TestValidator.equals(
    "'completed' listing excludes B1 (ownership isolation)",
    completedIds.includes(b1.id),
    false,
  );
  await TestValidator.predicate(
    "every item in 'completed' listing has status completed and has completed_at",
    async () =>
      pageCompleted.data.every(
        (s) =>
          s.status === "completed" &&
          s.completed_at !== null &&
          s.completed_at !== undefined,
      ),
  );
}
