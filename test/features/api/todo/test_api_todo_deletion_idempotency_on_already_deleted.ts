import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_todo_deletion_idempotency_on_already_deleted(
  connection: api.IConnection,
) {
  /**
   * Idempotent deletion validation for Todo removal.
   *
   * Flow:
   *
   * 1. Join as a todoUser (authorized session)
   * 2. Create a Todo
   * 3. Delete the Todo (first time) -> success
   * 4. Delete the same Todo again (second time) -> success (no error), proving
   *    idempotency
   *
   * Validations:
   *
   * - Typia.assert on join and create responses.
   * - Ownership check: created.todo_app_user_id === authorized.id.
   * - Second delete must not throw.
   */
  // 1) Authenticate (join) as todoUser
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);

  // 2) Create a Todo with a strictly bounded title (1–120 chars)
  const rawTitle = RandomGenerator.paragraph({ sentences: 3 }).trim();
  const boundedTitle = (rawTitle.length === 0 ? "x" : rawTitle).slice(0, 120);
  const createBody = {
    title: boundedTitle,
    description: RandomGenerator.paragraph({ sentences: 8 }),
    due_at: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
  } satisfies ITodoAppTodo.ICreate;
  const todo = await api.functional.todoApp.todoUser.todos.create(connection, {
    body: createBody,
  });
  typia.assert(todo);

  // Ownership verification
  TestValidator.equals(
    "created todo is owned by the authorized user",
    todo.todo_app_user_id,
    authorized.id,
  );

  // 3) First deletion should succeed
  await api.functional.todoApp.todoUser.todos.erase(connection, {
    todoId: todo.id,
  });

  // 4) Second deletion should be idempotent (no error)
  let secondDeleteSucceeded = true;
  try {
    await api.functional.todoApp.todoUser.todos.erase(connection, {
      todoId: todo.id,
    });
  } catch {
    secondDeleteSucceeded = false;
  }
  TestValidator.predicate(
    "second delete should complete without error (idempotent)",
    secondDeleteSucceeded,
  );
}
