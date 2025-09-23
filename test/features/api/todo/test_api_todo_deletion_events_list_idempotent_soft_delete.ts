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
 * Idempotent soft deletion: listing deletion events shows a single record.
 *
 * This test validates that performing DELETE on the same Todo multiple times is
 * idempotent: the first delete creates one deletion event and subsequent
 * deletes do not create additional events. The audit listing endpoint must
 * return exactly one deletion event.
 *
 * Steps:
 *
 * 1. Authenticate a todoUser (join)
 * 2. Create a Todo
 * 3. Delete the Todo once (creates a deletion event)
 * 4. Delete the Todo again (idempotent; no new event)
 * 5. List deletion events and assert there is exactly one record
 */
export async function test_api_todo_deletion_events_list_idempotent_soft_delete(
  connection: api.IConnection,
) {
  // 1) Authenticate as todoUser
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBody });
  typia.assert(authorized);

  // 2) Create a Todo (title within 120 chars)
  const createBody = {
    title: RandomGenerator.paragraph({ sentences: 3, wordMin: 3, wordMax: 7 }),
    description: RandomGenerator.paragraph({
      sentences: 8,
      wordMin: 3,
      wordMax: 8,
    }),
  } satisfies ITodoAppTodo.ICreate;
  const todo: ITodoAppTodo = await api.functional.todoApp.todoUser.todos.create(
    connection,
    { body: createBody },
  );
  typia.assert(todo);

  // 3) First delete to create a deletion event
  await api.functional.todoApp.todoUser.todos.erase(connection, {
    todoId: todo.id,
  });

  // 4) Second delete should be idempotent (no additional event created)
  await api.functional.todoApp.todoUser.todos.erase(connection, {
    todoId: todo.id,
  });

  // 5) List deletion events - expect exactly one record
  const listBody = {
    page: 1,
    limit: 10,
    direction: "desc",
  } satisfies ITodoAppTodoDeletionEvent.IRequest;
  const page: IPageITodoAppTodoDeletionEvent.ISummary =
    await api.functional.todoApp.todoUser.todos.deletionEvents.index(
      connection,
      { todoId: todo.id, body: listBody },
    );
  typia.assert(page);

  TestValidator.equals(
    "exactly one deletion event after idempotent deletes",
    page.data.length,
    1,
  );
}
