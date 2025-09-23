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
 * List deletion events after soft-deleting a Todo and verify idempotency.
 *
 * Scenario:
 *
 * - A user signs up (join) as todoUser and creates a Todo.
 * - The user soft-deletes the Todo once to generate a deletion event.
 * - The user lists deletion events for the Todo and confirms exactly one event
 *   exists.
 * - The user soft-deletes the same Todo again (idempotent operation) and confirms
 *   no additional deletion event has been created.
 *
 * Validations:
 *
 * - Response types are asserted with typia.assert().
 * - Exactly one deletion event is returned after first deletion.
 * - The deletion event's occurred_at lies within the [beforeDelete, afterDelete]
 *   window.
 * - After the second deletion (idempotent), listing still returns exactly one
 *   event with the same id.
 */
export async function test_api_todo_deletion_events_list_after_soft_delete(
  connection: api.IConnection,
) {
  // 1) Authenticate (join) as a todoUser
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authorized);

  // 2) Create a Todo and capture its id
  const rawTitle = RandomGenerator.paragraph({ sentences: 3 }).trim();
  const title = rawTitle.length > 120 ? rawTitle.slice(0, 120) : rawTitle; // ensure MaxLength<120>
  const todo = await api.functional.todoApp.todoUser.todos.create(connection, {
    body: {
      title,
    } satisfies ITodoAppTodo.ICreate,
  });
  typia.assert(todo);

  // 3) Soft-delete the Todo (first time) and record time window
  const beforeDeleteIso: string & tags.Format<"date-time"> =
    new Date().toISOString() as string & tags.Format<"date-time">;
  await api.functional.todoApp.todoUser.todos.erase(connection, {
    todoId: todo.id,
  });
  const afterDeleteIso: string & tags.Format<"date-time"> =
    new Date().toISOString() as string & tags.Format<"date-time">;

  // 4) List deletion events, expect exactly one event within time window
  const firstPage =
    await api.functional.todoApp.todoUser.todos.deletionEvents.index(
      connection,
      {
        todoId: todo.id,
        body: {
          page: 1,
          limit: 10,
          occurred_from: beforeDeleteIso,
          occurred_to: afterDeleteIso,
        } satisfies ITodoAppTodoDeletionEvent.IRequest,
      },
    );
  typia.assert(firstPage);

  TestValidator.equals(
    "exactly one deletion event after first soft delete",
    firstPage.data.length,
    1,
  );

  const firstEvent = firstPage.data[0];
  const startMs = new Date(beforeDeleteIso).getTime();
  const endMs = new Date(afterDeleteIso).getTime();
  const occurredMs = new Date(firstEvent.occurred_at).getTime();
  TestValidator.predicate(
    "occurred_at is within the deletion window",
    occurredMs >= startMs && occurredMs <= endMs,
  );

  // 5) Idempotency check: delete again and confirm listing remains single
  await api.functional.todoApp.todoUser.todos.erase(connection, {
    todoId: todo.id,
  });

  const secondPage =
    await api.functional.todoApp.todoUser.todos.deletionEvents.index(
      connection,
      {
        todoId: todo.id,
        body: {
          page: 1,
          limit: 10,
          occurred_from: beforeDeleteIso,
          occurred_to: afterDeleteIso,
        } satisfies ITodoAppTodoDeletionEvent.IRequest,
      },
    );
  typia.assert(secondPage);

  TestValidator.equals(
    "still one deletion event after idempotent second delete",
    secondPage.data.length,
    1,
  );

  TestValidator.equals(
    "deletion event id remains the same",
    secondPage.data[0].id,
    firstEvent.id,
  );
}
