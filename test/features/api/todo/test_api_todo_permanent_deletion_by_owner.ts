import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { IETodoMvpTodoStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IETodoMvpTodoStatus";
import type { ITodoMvpTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpTodo";
import type { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";

/**
 * Validate permanent deletion of a user's Todo (hard delete) with RBAC checks.
 *
 * Scenario rewrite (due to available APIs):
 *
 * - Use only join → create → erase endpoints. GET endpoints are not available, so
 *   deletion is verified by a second erase attempt and unauthenticated deletion
 *   attempts.
 *
 * Steps:
 *
 * 1. Join as a new user (SDK sets Authorization automatically)
 * 2. Create a Todo (minimal valid payload)
 * 3. Delete the Todo
 * 4. Verify hard delete by attempting to delete it again (should error)
 * 5. RBAC: With an unauthenticated connection, attempt to delete another fresh
 *    Todo (should error), then clean up by deleting it as the owner
 * 6. Attempt to delete a random non-existent UUID (should error)
 */
export async function test_api_todo_permanent_deletion_by_owner(
  connection: api.IConnection,
) {
  // 1) Join as a new user (Authorization header managed by SDK)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoMvpUser.ICreate;
  const auth: ITodoMvpUser.IAuthorized = await api.functional.auth.user.join(
    connection,
    { body: joinBody },
  );
  typia.assert(auth);

  // 2) Create a Todo (minimal valid payload)
  const createBody = {
    title: RandomGenerator.paragraph({ sentences: 3 }),
  } satisfies ITodoMvpTodo.ICreate;
  const todo: ITodoMvpTodo = await api.functional.todoMvp.user.todos.create(
    connection,
    { body: createBody },
  );
  typia.assert(todo);

  // Business default: new Todo status should be "open"
  TestValidator.equals(
    "newly created todo has default status 'open'",
    todo.status,
    "open",
  );

  // 3) Delete the Todo
  await api.functional.todoMvp.user.todos.erase(connection, {
    todoId: todo.id,
  });

  // 4) Verify hard delete: deleting same id again must error
  await TestValidator.error(
    "deleting an already-deleted todo should fail",
    async () => {
      await api.functional.todoMvp.user.todos.erase(connection, {
        todoId: todo.id,
      });
    },
  );

  // 5) RBAC: unauthenticated user cannot delete an existing todo
  //    - Create another todo, then try erase with a fresh unauthenticated connection
  const createBody2 = {
    title: RandomGenerator.paragraph({ sentences: 2 }),
  } satisfies ITodoMvpTodo.ICreate;
  const todo2: ITodoMvpTodo = await api.functional.todoMvp.user.todos.create(
    connection,
    { body: createBody2 },
  );
  typia.assert(todo2);

  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated connection cannot delete a todo",
    async () => {
      await api.functional.todoMvp.user.todos.erase(unauthConn, {
        todoId: todo2.id,
      });
    },
  );

  // Clean up: owner deletes the second todo
  await api.functional.todoMvp.user.todos.erase(connection, {
    todoId: todo2.id,
  });

  // 6) Deleting a non-existent random UUID should fail
  const nonExistentId = typia.random<string & tags.Format<"uuid">>();
  await TestValidator.error(
    "deleting a non-existent todo should fail",
    async () => {
      await api.functional.todoMvp.user.todos.erase(connection, {
        todoId: nonExistentId,
      });
    },
  );
}
