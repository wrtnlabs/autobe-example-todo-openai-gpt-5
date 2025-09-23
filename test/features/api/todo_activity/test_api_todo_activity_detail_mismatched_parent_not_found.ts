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
 * Verify that fetching an activity with a mismatched parent Todo is denied.
 *
 * Business context:
 *
 * - Activities are recorded per Todo (e.g., a 'create' activity when a Todo is
 *   created).
 * - A user must not be able to access an activity by pairing it with a different
 *   parent Todo id.
 *
 * Steps:
 *
 * 1. Register (join) a todoUser and acquire an authenticated session.
 * 2. Create two Todos (Todo A and Todo B) under the same user.
 * 3. List activities of Todo A and pick one activity id.
 * 4. Confirm the activity can be fetched with the correct parent (Todo A).
 * 5. Attempt to fetch the same activity with Todo B's id and expect an error.
 *
 * Notes:
 *
 * - Type validation uses typia.assert on all non-void responses.
 * - Error scenario uses TestValidator.error without checking specific HTTP status
 *   codes.
 */
export async function test_api_todo_activity_detail_mismatched_parent_not_found(
  connection: api.IConnection,
) {
  // 1) Register (join) a todoUser
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);

  // 2) Create two Todos (Todo A and Todo B)
  const todoABody = {
    title: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.paragraph({ sentences: 8 }),
    due_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  } satisfies ITodoAppTodo.ICreate;
  const todoA = await api.functional.todoApp.todoUser.todos.create(connection, {
    body: todoABody,
  });
  typia.assert(todoA);

  const todoBBody = {
    title: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.paragraph({ sentences: 6 }),
    due_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  } satisfies ITodoAppTodo.ICreate;
  const todoB = await api.functional.todoApp.todoUser.todos.create(connection, {
    body: todoBBody,
  });
  typia.assert(todoB);

  // 3) List activities of Todo A and pick one activity id
  const page = await api.functional.todoApp.todoUser.todos.activities.index(
    connection,
    {
      todoId: todoA.id,
      body: {
        page: 1,
        limit: 10,
      } satisfies ITodoAppTodoActivity.IRequest,
    },
  );
  typia.assert(page);

  TestValidator.predicate(
    "Todo A activities should contain at least one record",
    page.data.length > 0,
  );
  const activitySummary = page.data[0];

  // 4) Confirm the activity can be fetched with the correct parent (Todo A)
  const activity = await api.functional.todoApp.todoUser.todos.activities.at(
    connection,
    {
      todoId: todoA.id,
      activityId: activitySummary.id,
    },
  );
  typia.assert(activity);
  TestValidator.equals(
    "fetched activity id matches summary id",
    activity.id,
    activitySummary.id,
  );

  // 5) Attempt to fetch the same activity with Todo B's id and expect error
  await TestValidator.error(
    "mismatched parent todoId must not fetch the activity",
    async () => {
      await api.functional.todoApp.todoUser.todos.activities.at(connection, {
        todoId: todoB.id,
        activityId: activitySummary.id,
      });
    },
  );
}
