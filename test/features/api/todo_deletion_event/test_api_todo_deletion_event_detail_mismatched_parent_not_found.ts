import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppTodoDeletionEvent } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppTodoDeletionEvent";
import type { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import type { ITodoAppTodoDeletionEvent } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoDeletionEvent";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Verify that deletion event detail enforces correct parent-child relationship.
 *
 * Business context:
 *
 * - A deletion audit event belongs to a specific Todo. Accessing a valid
 *   deletionEventId with a different (mismatched) todoId must result in a
 *   not-found style error.
 *
 * Steps:
 *
 * 1. Join as a todoUser (auth token handled by SDK).
 * 2. Create Todo A.
 * 3. Delete Todo A to generate a deletion event.
 * 4. List deletion events under Todo A and capture deletionEventId_A.
 * 5. Create Todo B for mismatch testing.
 * 6. Positive control: GET detail with (Todo A, deletionEventId_A) succeeds and
 *    ids match.
 * 7. Negative path: GET detail with (Todo B, deletionEventId_A) throws error
 *    (not-found semantics).
 */
export async function test_api_todo_deletion_event_detail_mismatched_parent_not_found(
  connection: api.IConnection,
) {
  // 1) Authenticate as todoUser by joining
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBody });
  typia.assert(authorized);

  // 2) Create Todo A
  const createTodoABody = {
    title: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.paragraph({ sentences: 8 }),
    due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  } satisfies ITodoAppTodo.ICreate;
  const todoA: ITodoAppTodo =
    await api.functional.todoApp.todoUser.todos.create(connection, {
      body: createTodoABody,
    });
  typia.assert(todoA);

  // 3) Delete Todo A to generate a deletion event
  await api.functional.todoApp.todoUser.todos.erase(connection, {
    todoId: todoA.id,
  });

  // 4) List deletion events under Todo A and capture deletionEventId_A
  const listBody = {
    page: 1,
    limit: 10,
    sort: "occurred_at",
    direction: "desc",
    occurred_from: null,
    occurred_to: null,
    search: null,
  } satisfies ITodoAppTodoDeletionEvent.IRequest;
  const page = await api.functional.todoApp.todoUser.todos.deletionEvents.index(
    connection,
    { todoId: todoA.id, body: listBody },
  );
  typia.assert(page);
  TestValidator.predicate(
    "deletion events exist after deleting Todo A",
    page.data.length > 0,
  );
  const deletionEventIdA = page.data[0].id;

  // 5) Create Todo B for mismatched parent test (not deleted)
  const createTodoBBody = {
    title: RandomGenerator.paragraph({ sentences: 2 }),
    description: RandomGenerator.paragraph({ sentences: 5 }),
    due_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  } satisfies ITodoAppTodo.ICreate;
  const todoB: ITodoAppTodo =
    await api.functional.todoApp.todoUser.todos.create(connection, {
      body: createTodoBBody,
    });
  typia.assert(todoB);

  // 6) Positive control: fetch with correct parent (Todo A)
  const eventOk: ITodoAppTodoDeletionEvent =
    await api.functional.todoApp.todoUser.todos.deletionEvents.at(connection, {
      todoId: todoA.id,
      deletionEventId: deletionEventIdA,
    });
  typia.assert(eventOk);
  TestValidator.equals(
    "fetched deletion event id matches captured id",
    eventOk.id,
    deletionEventIdA,
  );

  // 7) Negative path: mismatched parent must error (not-found semantics)
  await TestValidator.error(
    "mismatched parent-child should result in not-found",
    async () => {
      await api.functional.todoApp.todoUser.todos.deletionEvents.at(
        connection,
        {
          todoId: todoB.id,
          deletionEventId: deletionEventIdA,
        },
      );
    },
  );
}
