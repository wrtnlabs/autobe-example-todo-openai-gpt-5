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
 * Verify that a different user (non-owner) cannot access another user's Todo
 * deletion event detail.
 *
 * Business flow:
 *
 * 1. User A joins and creates a Todo.
 * 2. User A deletes the Todo to generate a deletion event and lists events to
 *    capture the deletionEventId.
 * 3. Positive control: As User A (owner), fetch the deletion event detail and
 *    verify the ID.
 * 4. User B joins (switch auth context) and attempts to fetch the same deletion
 *    event detail.
 * 5. Expect an error for the non-owner access attempt (no status code
 *    verification).
 */
export async function test_api_todo_deletion_event_detail_access_denied_non_owner(
  connection: api.IConnection,
) {
  // 1) User A joins (owner)
  const ownerAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(ownerAuth);

  // 2) User A creates a Todo
  const createTodoBody = {
    title: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ITodoAppTodo.ICreate;

  const todo: ITodoAppTodo = await api.functional.todoApp.todoUser.todos.create(
    connection,
    {
      body: createTodoBody,
    },
  );
  typia.assert(todo);

  // 3) User A deletes the Todo (generates a deletion event)
  await api.functional.todoApp.todoUser.todos.erase(connection, {
    todoId: todo.id,
  });

  // 4) User A lists deletion events to capture deletionEventId
  const page = await api.functional.todoApp.todoUser.todos.deletionEvents.index(
    connection,
    {
      todoId: todo.id,
      body: {} satisfies ITodoAppTodoDeletionEvent.IRequest,
    },
  );
  typia.assert(page);

  TestValidator.predicate(
    "deletion events list should contain at least one record after deletion",
    page.data.length > 0,
  );
  const deletionEventId = page.data[0].id;

  // 5) Positive control: owner can fetch the deletion event detail
  const ownerEventDetail: ITodoAppTodoDeletionEvent =
    await api.functional.todoApp.todoUser.todos.deletionEvents.at(connection, {
      todoId: todo.id,
      deletionEventId,
    });
  typia.assert(ownerEventDetail);
  TestValidator.equals(
    "owner fetched deletion event id should match the listed summary id",
    ownerEventDetail.id,
    deletionEventId,
  );

  // 6) User B joins (non-owner) to switch auth context
  const nonOwnerAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(nonOwnerAuth);

  // 7) Non-owner attempts to access User A's deletion event detail -> must error
  await TestValidator.error(
    "non-owner cannot access another user's deletion event detail",
    async () => {
      await api.functional.todoApp.todoUser.todos.deletionEvents.at(
        connection,
        {
          todoId: todo.id,
          deletionEventId,
        },
      );
    },
  );
}
