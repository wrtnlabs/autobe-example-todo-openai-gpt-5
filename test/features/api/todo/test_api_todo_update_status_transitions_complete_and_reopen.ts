import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Verify Todo status transitions: complete and reopen.
 *
 * Business purpose:
 *
 * - Ensure that marking a Todo as completed sets completed_at and that reopening
 *   the Todo clears completed_at. Each successful update must refresh
 *   updated_at.
 *
 * End-to-end steps:
 *
 * 1. Join as a todoUser (auth.todoUser.join)
 * 2. Create a Todo (status should default to 'open')
 * 3. Update status to 'completed' → expect completed_at set and updated_at changed
 * 4. Update status back to 'open' → expect completed_at cleared and updated_at
 *    changed
 * 5. Idempotency: repeat 'open' to ensure invariants hold
 */
export async function test_api_todo_update_status_transitions_complete_and_reopen(
  connection: api.IConnection,
) {
  // 1) Join as a todoUser
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // 2) Create a Todo
  const todoCreateBody = {
    title: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.paragraph({ sentences: 10 }),
    due_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  } satisfies ITodoAppTodo.ICreate;
  const created: ITodoAppTodo =
    await api.functional.todoApp.todoUser.todos.create(connection, {
      body: todoCreateBody,
    });
  typia.assert(created);

  // Baseline validations
  TestValidator.equals("status is 'open' on creation", created.status, "open");
  TestValidator.predicate(
    "completed_at is null or undefined on creation",
    created.completed_at === null || created.completed_at === undefined,
  );

  const baselineUpdatedAt: string & tags.Format<"date-time"> =
    created.updated_at;

  // 3) Complete the Todo (status → 'completed')
  const completedResult: ITodoAppTodo =
    await api.functional.todoApp.todoUser.todos.update(connection, {
      todoId: created.id,
      body: { status: "completed" } satisfies ITodoAppTodo.IUpdate,
    });
  typia.assert(completedResult);

  TestValidator.equals(
    "status becomes 'completed' after completion",
    completedResult.status,
    "completed",
  );
  TestValidator.predicate(
    "completed_at is set after completion",
    completedResult.completed_at !== null &&
      completedResult.completed_at !== undefined,
  );
  TestValidator.notEquals(
    "updated_at changes on completion",
    completedResult.updated_at,
    baselineUpdatedAt,
  );

  // 4) Reopen the Todo (status → 'open')
  const reopenedResult: ITodoAppTodo =
    await api.functional.todoApp.todoUser.todos.update(connection, {
      todoId: created.id,
      body: { status: "open" } satisfies ITodoAppTodo.IUpdate,
    });
  typia.assert(reopenedResult);

  TestValidator.equals(
    "status becomes 'open' after reopening",
    reopenedResult.status,
    "open",
  );
  TestValidator.predicate(
    "completed_at is cleared after reopening",
    reopenedResult.completed_at === null ||
      reopenedResult.completed_at === undefined,
  );
  TestValidator.notEquals(
    "updated_at changes on reopening",
    reopenedResult.updated_at,
    completedResult.updated_at,
  );

  // 5) Idempotency sanity: repeat 'open' to ensure invariants hold
  const reopenedAgain: ITodoAppTodo =
    await api.functional.todoApp.todoUser.todos.update(connection, {
      todoId: created.id,
      body: { status: "open" } satisfies ITodoAppTodo.IUpdate,
    });
  typia.assert(reopenedAgain);
  TestValidator.equals(
    "status remains 'open' on idempotent open",
    reopenedAgain.status,
    "open",
  );
  TestValidator.predicate(
    "completed_at remains null/undefined on idempotent open",
    reopenedAgain.completed_at === null ||
      reopenedAgain.completed_at === undefined,
  );

  // Entity identity remains stable across updates
  TestValidator.equals(
    "id unchanged after completion",
    completedResult.id,
    created.id,
  );
  TestValidator.equals(
    "id unchanged after reopening",
    reopenedResult.id,
    created.id,
  );
  TestValidator.equals(
    "id unchanged after idempotent open",
    reopenedAgain.id,
    created.id,
  );
}
