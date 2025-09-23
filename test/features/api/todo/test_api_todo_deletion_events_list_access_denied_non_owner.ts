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
 * Ensure non-owner cannot list another user's Todo deletion events.
 *
 * Steps:
 *
 * 1. User A joins and authenticates.
 * 2. User A creates a Todo and then deletes it, producing a deletion event.
 * 3. (Sanity) User A lists deletion events and sees at least one entry.
 * 4. User B joins (auth context switches to B).
 * 5. User B attempts to list deletion events of User A's Todo and gets denied.
 */
export async function test_api_todo_deletion_events_list_access_denied_non_owner(
  connection: api.IConnection,
) {
  // 1) Join as User A (owner)
  const userABody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const userA: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: userABody });
  typia.assert(userA);

  // 2) User A creates a Todo
  const createTodoBody = {
    title: RandomGenerator.paragraph({ sentences: 3, wordMin: 3, wordMax: 8 }),
  } satisfies ITodoAppTodo.ICreate;
  const todo: ITodoAppTodo = await api.functional.todoApp.todoUser.todos.create(
    connection,
    { body: createTodoBody },
  );
  typia.assert(todo);

  // 3) User A deletes the Todo (soft delete)
  await api.functional.todoApp.todoUser.todos.erase(connection, {
    todoId: todo.id,
  });

  // 4) (Sanity) Owner can list deletion events and see at least one entry
  const ownerListBody = {} satisfies ITodoAppTodoDeletionEvent.IRequest;
  const ownerPage =
    await api.functional.todoApp.todoUser.todos.deletionEvents.index(
      connection,
      { todoId: todo.id, body: ownerListBody },
    );
  typia.assert(ownerPage);
  await TestValidator.predicate(
    "owner should see at least one deletion event after deletion",
    async () => ownerPage.data.length >= 1,
  );

  // 5) Join as User B (non-owner) - token switches automatically
  const userBBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const userB: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: userBBody });
  typia.assert(userB);

  // Non-owner attempt should be denied without leaking existence
  const nonOwnerReq = {} satisfies ITodoAppTodoDeletionEvent.IRequest;
  await TestValidator.error(
    "non-owner cannot list deletion events of another user's Todo",
    async () => {
      await api.functional.todoApp.todoUser.todos.deletionEvents.index(
        connection,
        { todoId: todo.id, body: nonOwnerReq },
      );
    },
  );
}
