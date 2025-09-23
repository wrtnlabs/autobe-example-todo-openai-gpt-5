import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Validate Todo soft deletion with idempotency and negative unauthorized
 * deletion.
 *
 * This test covers the feasible parts of the deletion lifecycle with the
 * provided SDK endpoints:
 *
 * 1. Register/login a todoUser (auth.todoUser.join)
 * 2. Create a Todo (todoApp.todoUser.todos.create)
 * 3. Delete the Todo (todoApp.todoUser.todos.erase)
 * 4. Delete the same Todo again to verify idempotency (should not error)
 * 5. Try deleting a distinct random UUID and assert an error occurs
 *
 * Notes:
 *
 * - Listing/audit trail/GET detail endpoints are not available in the SDK
 *   provided here, so verification is limited to idempotency and error path.
 * - This test does not validate HTTP status codes or error messages; it only
 *   asserts that errors occur where appropriate.
 */
export async function test_api_todo_deletion_soft_delete_and_audit_trail(
  connection: api.IConnection,
) {
  // 1) Register & authenticate todoUser
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authorized);

  // 2) Create a Todo owned by the authenticated user
  const todo = await api.functional.todoApp.todoUser.todos.create(connection, {
    body: {
      title: RandomGenerator.paragraph({
        sentences: 3,
        wordMin: 3,
        wordMax: 8,
      }),
      description: RandomGenerator.paragraph({
        sentences: 8,
        wordMin: 3,
        wordMax: 8,
      }),
      due_at: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // tomorrow
    } satisfies ITodoAppTodo.ICreate,
  });
  typia.assert(todo);

  // 3) Delete the Todo (soft delete)
  await api.functional.todoApp.todoUser.todos.erase(connection, {
    todoId: todo.id,
  });

  // 4) Verify idempotency: deleting again must not error
  await api.functional.todoApp.todoUser.todos.erase(connection, {
    todoId: todo.id,
  });

  // 5) Negative path: deleting a non-existent/unauthorized ID should error
  let nonExistentId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();
  while (nonExistentId === todo.id) {
    nonExistentId = typia.random<string & tags.Format<"uuid">>();
  }

  await TestValidator.error(
    "deleting non-existent or unauthorized todo should error",
    async () => {
      await api.functional.todoApp.todoUser.todos.erase(connection, {
        todoId: nonExistentId,
      });
    },
  );
}
