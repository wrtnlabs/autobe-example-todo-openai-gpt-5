import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { EActivityType } from "@ORGANIZATION/PROJECT-api/lib/structures/EActivityType";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppTodoActivity } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppTodoActivity";
import type { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import type { ITodoAppTodoActivity } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoActivity";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Ensure non-owner cannot access another user's Todo activity detail.
 *
 * Flow:
 *
 * 1. User A joins and creates a Todo.
 * 2. User A lists activities for the Todo and captures an activityId (prefer
 *    'create').
 * 3. User B joins (auth context switches to B automatically).
 * 4. User B requests the activity detail using User A's todoId/activityId.
 *
 * Assertions:
 *
 * - Todo ownership matches User A.
 * - The non-owner access attempt throws (no status code inspection).
 */
export async function test_api_todo_activity_detail_access_denied_non_owner(
  connection: api.IConnection,
) {
  // 1) User A joins (authorized context)
  const userA = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(userA);

  // 2) User A creates a Todo
  const createTodoBody = {
    title: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.paragraph({ sentences: 12 }),
    due_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  } satisfies ITodoAppTodo.ICreate;
  const todo = await api.functional.todoApp.todoUser.todos.create(connection, {
    body: createTodoBody,
  });
  typia.assert(todo);

  // Validate ownership: todo belongs to User A
  TestValidator.equals(
    "todo belongs to User A",
    todo.todo_app_user_id,
    userA.id,
  );

  // 3) User A lists activities for the Todo and captures an activityId
  const page = await api.functional.todoApp.todoUser.todos.activities.index(
    connection,
    {
      todoId: todo.id,
      body: {
        page: 1,
        limit: 10,
      } satisfies ITodoAppTodoActivity.IRequest,
    },
  );
  typia.assert(page);

  let targetActivityId: string & tags.Format<"uuid">;
  const preferred = page.data.find((it) => it.activity_type === "create");
  if (preferred) targetActivityId = preferred.id;
  else if (page.data.length > 0) targetActivityId = page.data[0].id;
  else targetActivityId = typia.random<string & tags.Format<"uuid">>();

  // 4) User B joins (switch auth context to B)
  const userB = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(userB);

  // 5) Non-owner tries to read the activity detail of User A's Todo
  await TestValidator.error(
    "non-owner cannot access another user's todo activity",
    async () => {
      await api.functional.todoApp.todoUser.todos.activities.at(connection, {
        todoId: todo.id,
        activityId: targetActivityId,
      });
    },
  );
}
