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

export async function test_api_todo_deletion_events_list_no_events_for_active_todo(
  connection: api.IConnection,
) {
  /**
   * Validate that listing deletion events for an active (non-deleted) Todo
   * returns an empty page with consistent pagination metadata.
   *
   * Business context:
   *
   * - Deletion audit entries are only recorded when a Todo is deleted.
   * - A newly created Todo should have no deletion events.
   *
   * Steps:
   *
   * 1. Register (join) a todoUser account and authenticate.
   * 2. Create a Todo for this user (do not delete it).
   * 3. List deletion events for the created Todo with explicit pagination.
   *
   * Validations:
   *
   * - Created Todo is active (deleted_at is null/undefined).
   * - Deletion events listing yields zero items and zero total records.
   */
  // 1) Authenticate (join) as a todoUser
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphabets(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);

  // 2) Create a Todo (keep it active: do not delete)
  const createTodoBody = {
    title: RandomGenerator.paragraph({ sentences: 3, wordMin: 3, wordMax: 8 }),
  } satisfies ITodoAppTodo.ICreate;
  const todo = await api.functional.todoApp.todoUser.todos.create(connection, {
    body: createTodoBody,
  });
  typia.assert(todo);

  // Sanity check: newly created Todo should not be deleted
  TestValidator.predicate(
    "created todo is active (deleted_at is null/undefined)",
    todo.deleted_at === null || todo.deleted_at === undefined,
  );

  // 3) List deletion events for this Todo with explicit pagination
  const listRequest = {
    page: 1,
    limit: 10,
  } satisfies ITodoAppTodoDeletionEvent.IRequest;
  const page = await api.functional.todoApp.todoUser.todos.deletionEvents.index(
    connection,
    {
      todoId: todo.id,
      body: listRequest,
    },
  );
  typia.assert(page);

  // Validations on empty result using predicates to avoid tagged-type equality friction
  TestValidator.predicate(
    "no deletion events returned",
    page.data.length === 0,
  );
  TestValidator.predicate(
    "total records is zero",
    page.pagination.records === 0,
  );
}
