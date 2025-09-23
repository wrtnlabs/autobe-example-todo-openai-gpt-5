import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Enforce ownership and identifier handling on Todo update endpoint.
 *
 * This test validates that only the owner can update a Todo and that updates
 * targeting non-existent resources are rejected without leaking existence. It
 * also verifies the successful update path for the legitimate owner.
 *
 * Flow:
 *
 * 1. Create two authenticated users (A and B) using separate connections.
 * 2. As user A, create a Todo and capture its id.
 * 3. As user B (non-owner), attempt to update A's Todo -> expect error.
 * 4. As user A, attempt to update a random valid UUID that does not exist ->
 *    expect error.
 * 5. As user A, successfully update own Todo -> verify changes.
 */
export async function test_api_todo_update_ownership_enforcement_and_invalid_ids(
  connection: api.IConnection,
) {
  // Prepare two independent connections so that each user keeps its own token
  const connA: api.IConnection = { ...connection, headers: {} };
  const connB: api.IConnection = { ...connection, headers: {} };

  // 1) Join user A
  const userA = await api.functional.auth.todoUser.join(connA, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(userA);

  // 2) As user A, create a Todo
  const createdTodo = await api.functional.todoApp.todoUser.todos.create(
    connA,
    {
      body: {
        title: RandomGenerator.paragraph({ sentences: 3 }),
        description: RandomGenerator.paragraph({ sentences: 12 }),
        due_at: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
      } satisfies ITodoAppTodo.ICreate,
    },
  );
  typia.assert(createdTodo);

  // 3) Join user B (non-owner)
  const userB = await api.functional.auth.todoUser.join(connB, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(userB);

  // 3-1) Non-owner tries to update owner's todo -> expect error
  await TestValidator.error(
    "non-owner cannot update another user's todo",
    async () => {
      await api.functional.todoApp.todoUser.todos.update(connB, {
        todoId: createdTodo.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 2 }),
        } satisfies ITodoAppTodo.IUpdate,
      });
    },
  );

  // 4) Owner attempts to update a random non-existent UUID -> expect error
  await TestValidator.error(
    "owner cannot update non-existent todo by random UUID",
    async () => {
      await api.functional.todoApp.todoUser.todos.update(connA, {
        todoId: typia.random<string & tags.Format<"uuid">>(),
        body: {
          title: RandomGenerator.paragraph({ sentences: 2 }),
        } satisfies ITodoAppTodo.IUpdate,
      });
    },
  );

  // 5) Owner successfully updates own Todo -> verify fields
  const newTitle = RandomGenerator.paragraph({ sentences: 2 });
  const newDueAt = new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString();
  const updated = await api.functional.todoApp.todoUser.todos.update(connA, {
    todoId: createdTodo.id,
    body: {
      title: newTitle,
      due_at: newDueAt,
      status: "completed",
    } satisfies ITodoAppTodo.IUpdate,
  });
  typia.assert(updated);

  TestValidator.equals(
    "owner update keeps same id",
    updated.id,
    createdTodo.id,
  );
  TestValidator.equals("owner update applied title", updated.title, newTitle);
  TestValidator.equals(
    "status changed to completed",
    updated.status,
    "completed",
  );
}
