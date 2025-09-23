import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { EOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/EOrderDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppBusinessEvent } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppBusinessEvent";
import type { ITodoAppBusinessEvent } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppBusinessEvent";
import type { ITodoAppEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEventType";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_business_events_filter_by_todo_context_and_date_window(
  connection: api.IConnection,
) {
  /**
   * Validate admin filtering of business events by Todo context and time
   * window.
   *
   * Steps:
   *
   * 1. Join as systemAdmin (admin session)
   * 2. Create an event type (taxonomy)
   * 3. Join as todoUser (switch session)
   * 4. Capture windowStart, create a Todo (emit events), capture windowEnd
   * 5. Re-join as systemAdmin (switch back to admin)
   * 6. Search business events by todo_app_todo_id within [windowStart, windowEnd]
   * 7. Validate filtering, pagination, and sorting correctness
   * 8. Edge cases: invalid time window, unknown todo id (empty), unauthorized
   *    access
   */
  // 1) Join as systemAdmin
  const adminEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const adminPassword: string = RandomGenerator.alphaNumeric(12);
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: adminEmail,
        password: adminPassword,
        ip: "127.0.0.1",
        user_agent: "e2e-test/1.0",
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(adminAuth);

  // 2) Create an event type (taxonomy)
  const eventType: ITodoAppEventType =
    await api.functional.todoApp.systemAdmin.eventTypes.create(connection, {
      body: {
        code: `todo.created.${RandomGenerator.alphaNumeric(8)}`,
        name: `Todo Created ${RandomGenerator.alphaNumeric(4)}`,
        description: RandomGenerator.paragraph({ sentences: 6 }),
        active: true,
      } satisfies ITodoAppEventType.ICreate,
    });
  typia.assert(eventType);

  // 3) Join as todoUser (switch session)
  const userEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const userPassword: string = RandomGenerator.alphaNumeric(12);
  const userAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email: userEmail,
        password: userPassword,
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(userAuth);

  // 4) Capture windowStart, create a Todo, capture windowEnd
  const windowStart: string & tags.Format<"date-time"> = new Date(
    Date.now() - 60 * 1000,
  ).toISOString() as string & tags.Format<"date-time">; // 1 minute before create

  const todo: ITodoAppTodo = await api.functional.todoApp.todoUser.todos.create(
    connection,
    {
      body: {
        title: RandomGenerator.paragraph({ sentences: 3 }),
        description: RandomGenerator.paragraph({ sentences: 10 }),
      } satisfies ITodoAppTodo.ICreate,
    },
  );
  typia.assert(todo);

  const windowEnd: string & tags.Format<"date-time"> = new Date(
    Date.now() + 2 * 60 * 1000,
  ).toISOString() as string & tags.Format<"date-time">; // slightly after now

  // 5) Re-join as systemAdmin (switch back)
  const adminAuth2: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(adminAuth2);

  // 6) Search business events with filters (page 0, small limit)
  const pageLimit = 10;
  const pageIndex = 0;
  const page: IPageITodoAppBusinessEvent =
    await api.functional.todoApp.systemAdmin.businessEvents.index(connection, {
      body: {
        page: pageIndex,
        limit: pageLimit,
        sort: "occurred_at",
        direction: "desc",
        todo_app_todo_id: todo.id,
        occurred_from: windowStart,
        occurred_to: windowEnd,
      } satisfies ITodoAppBusinessEvent.IRequest,
    });
  typia.assert(page);

  // 7) Validations: filter, window, pagination, sorting
  // Filter: all events must have matching todo_app_todo_id
  const allMatchTodo = page.data.every((e) => e.todo_app_todo_id === todo.id);
  TestValidator.predicate(
    "all events reference the created todo",
    allMatchTodo,
  );

  // Window: occurred_at within [windowStart, windowEnd]
  const fromMs = new Date(windowStart).getTime();
  const toMs = new Date(windowEnd).getTime();
  const allWithinWindow = page.data.every((e) => {
    const t = new Date(e.occurred_at).getTime();
    return fromMs <= t && t <= toMs;
  });
  TestValidator.predicate(
    "all events occurred_at within the given window",
    allWithinWindow,
  );

  // Pagination coherence
  TestValidator.predicate(
    "pagination.limit equals requested limit",
    page.pagination.limit === pageLimit,
  );
  TestValidator.predicate(
    "data length must be <= limit",
    page.data.length <= pageLimit,
  );
  TestValidator.predicate(
    "current page is non-negative",
    page.pagination.current >= 0,
  );
  TestValidator.predicate(
    "pages count is non-negative",
    page.pagination.pages >= 0,
  );

  // Sorting: occurred_at desc (non-increasing)
  const sortedDesc = page.data.every((e, i, arr) =>
    i === 0
      ? true
      : new Date(arr[i - 1].occurred_at).getTime() >=
        new Date(e.occurred_at).getTime(),
  );
  TestValidator.predicate("events sorted by occurred_at desc", sortedDesc);

  // 8-a) Invalid time window (from > to) should error
  await TestValidator.error("invalid time window must error", async () => {
    await api.functional.todoApp.systemAdmin.businessEvents.index(connection, {
      body: {
        page: 0,
        limit: 1,
        todo_app_todo_id: todo.id,
        occurred_from: windowEnd,
        occurred_to: windowStart,
      } satisfies ITodoAppBusinessEvent.IRequest,
    });
  });

  // 8-b) Unknown todo id should return empty set
  const unknownTodoId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();
  const emptyPage: IPageITodoAppBusinessEvent =
    await api.functional.todoApp.systemAdmin.businessEvents.index(connection, {
      body: {
        page: 0,
        limit: 5,
        todo_app_todo_id: unknownTodoId,
        occurred_from: windowStart,
        occurred_to: windowEnd,
      } satisfies ITodoAppBusinessEvent.IRequest,
    });
  typia.assert(emptyPage);
  TestValidator.equals(
    "unknown todo id yields empty list",
    emptyPage.data.length,
    0,
  );

  // 8-c) Unauthorized: unauthenticated connection should error
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error("unauthenticated access must error", async () => {
    await api.functional.todoApp.systemAdmin.businessEvents.index(unauthConn, {
      body: {
        page: 0,
        limit: 1,
      } satisfies ITodoAppBusinessEvent.IRequest,
    });
  });

  // 8-d) Unauthorized: non-admin (todoUser) token must error
  await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(10),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  await TestValidator.error(
    "todoUser must not access admin business events",
    async () => {
      await api.functional.todoApp.systemAdmin.businessEvents.index(
        connection,
        {
          body: { limit: 1, page: 0 } satisfies ITodoAppBusinessEvent.IRequest,
        },
      );
    },
  );
}
