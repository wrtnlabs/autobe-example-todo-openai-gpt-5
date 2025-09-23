import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Enforce ownership on Todo deletion and validate identifier handling.
 *
 * Business goal:
 *
 * - Only the owner can delete their Todo.
 * - Deleting a well-formed but non-existent UUID must fail without data leakage.
 * - Soft deletion must be idempotent (repeating delete succeeds without error).
 *
 * Scenario steps:
 *
 * 1. Join as user A; create a Todo as A.
 * 2. Join as user B; try to delete A's Todo (expect error).
 * 3. As A, try to delete a random valid UUID that does not exist (expect error).
 * 4. As A, delete own Todo (expect success), then delete again (idempotent
 *    success).
 */
export async function test_api_todo_deletion_ownership_enforcement_and_invalid_id(
  connection: api.IConnection,
) {
  // Prepare two independent authenticated sessions without manual header manipulation
  const connA: api.IConnection = { ...connection, headers: {} };
  const connB: api.IConnection = { ...connection, headers: {} };

  // 1) Register user A
  const emailA: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const passwordA: string & tags.MinLength<8> & tags.MaxLength<64> =
    typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>();
  const authA: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connA, {
      body: {
        email: emailA,
        password: passwordA,
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(authA);

  // 2) As A, create a Todo (use a short title to meet 1-120 chars constraint)
  const createBody = {
    title: RandomGenerator.alphabets(20),
    description: RandomGenerator.paragraph({ sentences: 8 }),
    due_at: typia.random<string & tags.Format<"date-time">>(),
  } satisfies ITodoAppTodo.ICreate;
  const todo: ITodoAppTodo = await api.functional.todoApp.todoUser.todos.create(
    connA,
    { body: createBody },
  );
  typia.assert(todo);
  TestValidator.equals(
    "created todo is owned by user A",
    todo.todo_app_user_id,
    authA.id,
  );

  // 3) Register user B
  const emailB: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const passwordB: string & tags.MinLength<8> & tags.MaxLength<64> =
    typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>();
  const authB: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connB, {
      body: {
        email: emailB,
        password: passwordB,
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(authB);

  // 4) Negative: user B cannot delete user A's Todo
  await TestValidator.error("user B cannot delete user A's todo", async () => {
    await api.functional.todoApp.todoUser.todos.erase(connB, {
      todoId: todo.id,
    });
  });

  // 5) Negative: As A, deleting a non-existent but well-formed UUID must fail
  let nonExistentId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();
  while (nonExistentId === todo.id) {
    nonExistentId = typia.random<string & tags.Format<"uuid">>();
  }
  await TestValidator.error(
    "deleting non-existent well-formed UUID fails",
    async () => {
      await api.functional.todoApp.todoUser.todos.erase(connA, {
        todoId: nonExistentId,
      });
    },
  );

  // 6) Positive: As A, delete own Todo (success)
  const firstErase = await api.functional.todoApp.todoUser.todos.erase(connA, {
    todoId: todo.id,
  });
  typia.assert(firstErase);

  // 7) Idempotency: repeat deletion (success)
  const secondErase = await api.functional.todoApp.todoUser.todos.erase(connA, {
    todoId: todo.id,
  });
  typia.assert(secondErase);
}
