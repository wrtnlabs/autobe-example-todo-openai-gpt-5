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
 * Verify that the Todo owner can retrieve a specific deletion audit entry.
 *
 * Steps:
 *
 * 1. Join as a todoUser (owner).
 * 2. Create a Todo, then soft-delete it to generate a deletion event.
 * 3. List deletion events to obtain a deletionEventId.
 * 4. Fetch the deletion event detail and validate business invariants.
 * 5. Negative case: another user tries to access the owner's deletion event and
 *    fails.
 */
export async function test_api_todo_deletion_event_detail_owner_access(
  connection: api.IConnection,
) {
  // 1) Join as the Todo owner
  const owner = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(owner);

  // 2) Create a Todo owned by the authenticated user
  const createBody = {
    title: RandomGenerator.paragraph({ sentences: 3, wordMin: 3, wordMax: 8 }),
    description: RandomGenerator.paragraph({
      sentences: 10,
      wordMin: 3,
      wordMax: 8,
    }),
    due_at: null,
  } satisfies ITodoAppTodo.ICreate;
  const todo = await api.functional.todoApp.todoUser.todos.create(connection, {
    body: createBody,
  });
  typia.assert(todo);

  // 3) Soft-delete the Todo to generate a deletion audit event
  await api.functional.todoApp.todoUser.todos.erase(connection, {
    todoId: todo.id,
  });

  // 4) List deletion events to discover a deletionEventId
  const page = await api.functional.todoApp.todoUser.todos.deletionEvents.index(
    connection,
    {
      todoId: todo.id,
      body: {
        page: 1,
        limit: 10,
      } satisfies ITodoAppTodoDeletionEvent.IRequest,
    },
  );
  typia.assert(page);
  TestValidator.predicate(
    "at least one deletion event returned for the deleted todo",
    page.data.length >= 1,
  );
  TestValidator.predicate(
    "pagination records count reflects at least one entry",
    page.pagination.records >= 1,
  );
  const summary = page.data[0];

  // 5) Fetch specific deletion event detail
  const event = await api.functional.todoApp.todoUser.todos.deletionEvents.at(
    connection,
    {
      todoId: todo.id,
      deletionEventId: summary.id,
    },
  );
  typia.assert(event);

  // Business validations
  TestValidator.equals("detail id equals summary id", event.id, summary.id);
  TestValidator.equals(
    "occurred_at matches the summary",
    event.occurred_at,
    summary.occurred_at,
  );
  TestValidator.equals(
    "reason in detail matches summary reason",
    event.reason,
    summary.reason,
  );
  // If FK is preserved on soft-delete, ensure it matches the Todo id
  if (event.todo_app_todo_id !== null && event.todo_app_todo_id !== undefined) {
    TestValidator.equals(
      "event.todo_app_todo_id equals the deleted todo.id",
      event.todo_app_todo_id,
      todo.id,
    );
  }
  // If the deleter FK is available, it must equal the owner's id
  if (event.todo_app_user_id !== null && event.todo_app_user_id !== undefined) {
    TestValidator.equals(
      "deleter id equals owner's id",
      event.todo_app_user_id,
      owner.id,
    );
  }

  // 6) Negative test: another user cannot access this owner's deletion event
  const intruder = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(intruder);
  await TestValidator.error(
    "non-owner cannot access another user's deletion event detail",
    async () => {
      await api.functional.todoApp.todoUser.todos.deletionEvents.at(
        connection,
        {
          todoId: todo.id,
          deletionEventId: event.id,
        },
      );
    },
  );
}
