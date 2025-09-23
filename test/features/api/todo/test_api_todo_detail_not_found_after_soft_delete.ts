import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Validate that a soft-deleted Todo cannot be fetched by detail endpoint.
 *
 * Workflow:
 *
 * 1. Join as todoUser to obtain authenticated session.
 * 2. Create a Todo and verify baseline accessibility with GET by id.
 * 3. Soft-delete the Todo.
 * 4. Ensure subsequent GET by id fails (authorization-safe denial).
 * 5. Optionally, confirm idempotent DELETE and repeated GET failure.
 */
export async function test_api_todo_detail_not_found_after_soft_delete(
  connection: api.IConnection,
) {
  // 1) Join as todoUser (SDK sets Authorization header automatically)
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authorized);

  // 2) Create a Todo
  const created = await api.functional.todoApp.todoUser.todos.create(
    connection,
    {
      body: {
        title: RandomGenerator.paragraph({ sentences: 3 }),
        // optional fields intentionally omitted
      } satisfies ITodoAppTodo.ICreate,
    },
  );
  typia.assert(created);

  // 3) Baseline GET by id should succeed
  const beforeDeletion = await api.functional.todoApp.todoUser.todos.at(
    connection,
    {
      todoId: created.id,
    },
  );
  typia.assert(beforeDeletion);
  TestValidator.equals(
    "detail before deletion returns the created todo",
    beforeDeletion.id,
    created.id,
  );

  // 4) Soft-delete the Todo
  await api.functional.todoApp.todoUser.todos.erase(connection, {
    todoId: created.id,
  });

  // 5) GET after soft deletion must fail (do not assert specific status codes)
  await TestValidator.error(
    "detail read after soft delete must be denied",
    async () => {
      await api.functional.todoApp.todoUser.todos.at(connection, {
        todoId: created.id,
      });
    },
  );

  // Optional: DELETE is idempotent - repeating should not throw
  await api.functional.todoApp.todoUser.todos.erase(connection, {
    todoId: created.id,
  });

  // Re-verify GET still fails
  await TestValidator.error(
    "detail read remains denied after repeated delete",
    async () => {
      await api.functional.todoApp.todoUser.todos.at(connection, {
        todoId: created.id,
      });
    },
  );
}
