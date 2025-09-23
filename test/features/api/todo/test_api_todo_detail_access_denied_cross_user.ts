import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Access-control denial on cross-user Todo detail.
 *
 * This test validates that a user cannot retrieve another user's Todo detail
 * and that the backend responds with an authorization-safe denial (e.g., 404)
 * without disclosing the resource existence.
 *
 * Flow:
 *
 * 1. Register User A (join) and authenticate automatically.
 * 2. As User A, create a Todo and verify ownership linkage.
 * 3. Sanity-check: As User A, GET the created Todo detail.
 * 4. Register User B (join) to switch identity.
 * 5. As User B, attempt to GET User A's Todo detail and expect an error.
 */
export async function test_api_todo_detail_access_denied_cross_user(
  connection: api.IConnection,
) {
  // 1) Register User A and authenticate
  const joinBodyA = typia.random<ITodoAppTodoUser.ICreate>();
  const userA = await api.functional.auth.todoUser.join(connection, {
    body: joinBodyA satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(userA);

  // 2) As User A, create a Todo
  const createTodoBody = typia.random<ITodoAppTodo.ICreate>();
  const todoA = await api.functional.todoApp.todoUser.todos.create(connection, {
    body: createTodoBody satisfies ITodoAppTodo.ICreate,
  });
  typia.assert(todoA);

  // Validate ownership linkage
  TestValidator.equals(
    "created todo is owned by user A",
    todoA.todo_app_user_id,
    userA.id,
  );

  // 3) Owner sanity-check: can read own Todo
  const readAsA = await api.functional.todoApp.todoUser.todos.at(connection, {
    todoId: todoA.id,
  });
  typia.assert(readAsA);
  TestValidator.equals("owner can read own todo", readAsA.id, todoA.id);

  // 4) Register User B (switch identity via join)
  const joinBodyB = typia.random<ITodoAppTodoUser.ICreate>();
  const userB = await api.functional.auth.todoUser.join(connection, {
    body: joinBodyB satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(userB);

  TestValidator.notEquals(
    "user B must be different from user A",
    userB.id,
    userA.id,
  );

  // 5) Cross-user access attempt: expect denial without existence leak
  await TestValidator.error(
    "cross-user cannot access another user's todo detail",
    async () => {
      await api.functional.todoApp.todoUser.todos.at(connection, {
        todoId: todoA.id,
      });
    },
  );
}
