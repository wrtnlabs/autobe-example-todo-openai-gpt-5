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
 * Validate that a non-owner cannot delete another user's Todo.
 *
 * Business flow:
 *
 * 1. Create two independent connections (connA, connB) so each join() call manages
 *    its own Authorization token without manual header manipulation.
 * 2. User A joins and creates a Todo.
 * 3. User B joins and attempts to delete User A's Todo (must fail).
 * 4. Verify no side effect by deleting the Todo successfully as User A.
 *
 * Notes:
 *
 * - Uses only provided APIs: join (auth), create (Todo), and erase (delete).
 * - Avoids any direct access to connection.headers.
 * - Uses typia.assert on non-void responses and TestValidator.error for the
 *   expected unauthorized deletion failure.
 */
export async function test_api_todo_deletion_by_non_owner_forbidden(
  connection: api.IConnection,
) {
  // Prepare two independent connections to isolate auth contexts
  const connA: api.IConnection = { ...connection, headers: {} };
  const connB: api.IConnection = { ...connection, headers: {} };

  // 1) User A joins (becomes authenticated on connA)
  const authA: ITodoMvpUser.IAuthorized = await api.functional.auth.user.join(
    connA,
    {
      body: typia.random<ITodoMvpUser.ICreate>(),
    },
  );
  typia.assert(authA);

  // 2) User A creates a Todo
  const todo: ITodoMvpTodo = await api.functional.todoMvp.user.todos.create(
    connA,
    {
      body: typia.random<ITodoMvpTodo.ICreate>(),
    },
  );
  typia.assert(todo);

  // 3) User B joins (becomes authenticated on connB)
  const authB: ITodoMvpUser.IAuthorized = await api.functional.auth.user.join(
    connB,
    {
      body: typia.random<ITodoMvpUser.ICreate>(),
    },
  );
  typia.assert(authB);

  // Sanity check: two distinct users
  TestValidator.notEquals(
    "user A and user B must be different",
    authB.id,
    authA.id,
  );

  // 4) Non-owner deletion attempt must fail
  await TestValidator.error(
    "non-owner cannot delete another user's todo",
    async () => {
      await api.functional.todoMvp.user.todos.erase(connB, {
        todoId: todo.id,
      });
    },
  );

  // 5) Owner deletion should succeed (no error) proving no side effect
  await api.functional.todoMvp.user.todos.erase(connA, { todoId: todo.id });
}
