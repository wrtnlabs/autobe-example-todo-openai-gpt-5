import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { EActivityType } from "@ORGANIZATION/PROJECT-api/lib/structures/EActivityType";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppTodoActivity } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppTodoActivity";
import type { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import type { ITodoAppTodoActivity } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoActivity";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Validate activity history listing with pagination, sorting, and filters.
 *
 * Business flow:
 *
 * 1. Join as a todoUser (authentication established by SDK automatically)
 * 2. Create a Todo to seed activity history ("create")
 * 3. Generate activities by:
 *
 *    - Updating title ("update")
 *    - Marking completed ("complete")
 *    - Reopening ("reopen")
 * 4. List activities with default parameters → expect occurred_at desc
 * 5. Filter by activity_type ("update") with sort asc
 * 6. Filter by a specific occurred_at timestamp (from a known activity) and type,
 *    validating date range inclusivity
 * 7. Validate pagination invariants with limit=1 (and page 2 when applicable)
 */
export async function test_api_todo_activity_listing_with_filters_and_sorting(
  connection: api.IConnection,
) {
  // 1) Authenticate as a fresh user (join)
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authorized);

  // 2) Create a Todo to generate initial activity ("create")
  const createBody = {
    title: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.paragraph({ sentences: 8 }),
    due_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // +1 hour
  } satisfies ITodoAppTodo.ICreate;
  const todo = await api.functional.todoApp.todoUser.todos.create(connection, {
    body: createBody,
  });
  typia.assert(todo);
  // Ownership check: created todo should belong to authenticated user
  TestValidator.equals(
    "created todo belongs to authorized user",
    todo.todo_app_user_id,
    authorized.id,
  );

  // 3) Produce multiple activities: update title, complete, reopen
  const updatedTitle = await api.functional.todoApp.todoUser.todos.update(
    connection,
    {
      todoId: todo.id,
      body: {
        title: RandomGenerator.paragraph({ sentences: 2 }),
      } satisfies ITodoAppTodo.IUpdate,
    },
  );
  typia.assert(updatedTitle);

  const completed = await api.functional.todoApp.todoUser.todos.update(
    connection,
    {
      todoId: todo.id,
      body: {
        status: "completed",
      } satisfies ITodoAppTodo.IUpdate,
    },
  );
  typia.assert(completed);

  const reopened = await api.functional.todoApp.todoUser.todos.update(
    connection,
    {
      todoId: todo.id,
      body: {
        status: "open",
      } satisfies ITodoAppTodo.IUpdate,
    },
  );
  typia.assert(reopened);

  // 4) Default listing (no explicit filters) → should be occurred_at desc
  const pageDefault =
    await api.functional.todoApp.todoUser.todos.activities.index(connection, {
      todoId: todo.id,
      body: {} satisfies ITodoAppTodoActivity.IRequest,
    });
  typia.assert(pageDefault);

  const descOrdered = pageDefault.data.every(
    (elem, i, arr) =>
      i === 0 ||
      new Date(arr[i - 1].occurred_at).getTime() >=
        new Date(elem.occurred_at).getTime(),
  );
  TestValidator.predicate(
    "default listing ordered by occurred_at desc",
    descOrdered,
  );

  const p0 = pageDefault.pagination;
  // Data length must obey limit semantics (limit could be 0 per schema)
  TestValidator.predicate(
    "data length respects pagination limit when limit > 0",
    p0.limit === 0
      ? pageDefault.data.length === 0
      : pageDefault.data.length <= p0.limit,
  );

  // 5) Filter by activity_type = ["update"], ascending order
  const updateType: EActivityType = "update";
  const pageUpdateAsc =
    await api.functional.todoApp.todoUser.todos.activities.index(connection, {
      todoId: todo.id,
      body: {
        activity_types: [updateType],
        sort: "occurred_at",
        direction: "asc",
        limit: 50,
      } satisfies ITodoAppTodoActivity.IRequest,
    });
  typia.assert(pageUpdateAsc);

  // All rows must be type "update"
  TestValidator.predicate(
    "filter activity_types=[update] returns only 'update'",
    pageUpdateAsc.data.every((a) => a.activity_type === "update"),
  );
  // Ascending order check
  const ascOrdered = pageUpdateAsc.data.every(
    (elem, i, arr) =>
      i === 0 ||
      new Date(arr[i - 1].occurred_at).getTime() <=
        new Date(elem.occurred_at).getTime(),
  );
  TestValidator.predicate(
    "listing ordered by occurred_at asc when requested",
    ascOrdered,
  );

  // 6) Date range filter around a known activity timestamp
  // Prefer a "complete" activity; fallback to first available row
  const known =
    pageDefault.data.find((a) => a.activity_type === "complete") ??
    pageDefault.data[0];
  if (known !== undefined) {
    // Derive an EActivityType value for the request without using assertions inside the body
    const knownType = ((): EActivityType => {
      switch (known.activity_type) {
        case "create":
        case "update":
        case "complete":
        case "reopen":
        case "delete":
          return known.activity_type;
        default:
          return "update"; // safe fallback to a known enum member
      }
    })();

    const pageByInstant =
      await api.functional.todoApp.todoUser.todos.activities.index(connection, {
        todoId: todo.id,
        body: {
          activity_types: [knownType],
          occurred_from: known.occurred_at,
          occurred_to: known.occurred_at,
          sort: "occurred_at",
          direction: "asc",
          limit: 50,
        } satisfies ITodoAppTodoActivity.IRequest,
      });
    typia.assert(pageByInstant);

    // All results must match the chosen type and lie within [from, to]
    TestValidator.predicate(
      "date range filter isolates chosen instant and type",
      pageByInstant.data.every(
        (a) =>
          a.activity_type === known.activity_type &&
          new Date(a.occurred_at).getTime() >=
            new Date(known.occurred_at).getTime() &&
          new Date(a.occurred_at).getTime() <=
            new Date(known.occurred_at).getTime(),
      ),
    );
  }

  // 7) Pagination invariants with limit=1 (and page 2 when available)
  const page1 = await api.functional.todoApp.todoUser.todos.activities.index(
    connection,
    {
      todoId: todo.id,
      body: {
        sort: "occurred_at",
        direction: "desc",
        limit: 1,
        page: 1,
      } satisfies ITodoAppTodoActivity.IRequest,
    },
  );
  typia.assert(page1);
  TestValidator.predicate(
    "page1 respects limit=1",
    page1.pagination.limit === 0
      ? page1.data.length === 0
      : page1.data.length <= 1,
  );

  if (page1.pagination.records >= 2) {
    const page2 = await api.functional.todoApp.todoUser.todos.activities.index(
      connection,
      {
        todoId: todo.id,
        body: {
          sort: "occurred_at",
          direction: "desc",
          limit: 1,
          page: 2,
        } satisfies ITodoAppTodoActivity.IRequest,
      },
    );
    typia.assert(page2);
    TestValidator.predicate(
      "page2 either empty or different first entity from page1",
      page2.data.length === 0 ||
        (page1.data.length > 0 && page2.data[0]?.id !== page1.data[0]?.id),
    );
  }
}
