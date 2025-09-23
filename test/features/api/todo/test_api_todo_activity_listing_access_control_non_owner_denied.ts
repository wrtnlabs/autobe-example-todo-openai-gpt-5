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
 * Verify that only the Todo owner can list its activities and that a non-owner
 * is denied.
 *
 * Business flow:
 *
 * 1. Register User A and obtain auth (SDK manages token).
 * 2. As User A, create a Todo.
 * 3. Generate activities by updating the Todo several times (title change,
 *    complete, reopen).
 * 4. As User A (owner), list activities successfully.
 * 5. Register User B (token switches to B via SDK).
 * 6. As User B (non-owner), attempt to list A's Todo activities and expect an
 *    error (no status code assertion).
 *
 * Notes:
 *
 * - Request bodies strictly use correct DTO variants (ICreate/IUpdate/IRequest)
 *   with `satisfies`.
 * - Tagged fields (title/password) are generated via typia.random<...>() to meet
 *   tag constraints.
 * - No manual header manipulation; SDK handles Authorization on join().
 * - No type-error tests; all inputs are valid types.
 */
export async function test_api_todo_activity_listing_access_control_non_owner_denied(
  connection: api.IConnection,
) {
  // 1) Register User A (join) → SDK sets Authorization header
  const userAEmail = typia.random<string & tags.Format<"email">>();
  const userAPassword = typia.random<
    string & tags.MinLength<8> & tags.MaxLength<64>
  >();
  const authA = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: userAEmail,
      password: userAPassword,
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authA);

  // 2) Create a Todo under User A
  const createTodoBody = {
    title: typia.random<string & tags.MinLength<1> & tags.MaxLength<120>>(),
    description: null,
    due_at: null,
  } satisfies ITodoAppTodo.ICreate;
  const todo = await api.functional.todoApp.todoUser.todos.create(connection, {
    body: createTodoBody,
  });
  typia.assert(todo);

  // 3) Generate activities via updates (title change, complete, reopen)
  const updateBody1 = {
    title: typia.random<string & tags.MinLength<1> & tags.MaxLength<120>>(),
  } satisfies ITodoAppTodo.IUpdate;
  const updated1 = await api.functional.todoApp.todoUser.todos.update(
    connection,
    {
      todoId: todo.id,
      body: updateBody1,
    },
  );
  typia.assert(updated1);

  const updateBody2 = {
    status: "completed",
  } satisfies ITodoAppTodo.IUpdate;
  const updated2 = await api.functional.todoApp.todoUser.todos.update(
    connection,
    {
      todoId: todo.id,
      body: updateBody2,
    },
  );
  typia.assert(updated2);

  const updateBody3 = {
    status: "open",
  } satisfies ITodoAppTodo.IUpdate;
  const updated3 = await api.functional.todoApp.todoUser.todos.update(
    connection,
    {
      todoId: todo.id,
      body: updateBody3,
    },
  );
  typia.assert(updated3);

  // 4) Owner can list activities
  const ownerListReq = {
    direction: "desc",
  } satisfies ITodoAppTodoActivity.IRequest;
  const ownerActivities =
    await api.functional.todoApp.todoUser.todos.activities.index(connection, {
      todoId: todo.id,
      body: ownerListReq,
    });
  typia.assert(ownerActivities);

  // 5) Register User B (Authorization switches to B)
  const userBEmail = typia.random<string & tags.Format<"email">>();
  const userBPassword = typia.random<
    string & tags.MinLength<8> & tags.MaxLength<64>
  >();
  const authB = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: userBEmail,
      password: userBPassword,
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authB);

  // 6) Non-owner cannot list A's activities (expect error, do not assert status code)
  await TestValidator.error(
    "non-owner must be denied to list another user's todo activities",
    async () => {
      await api.functional.todoApp.todoUser.todos.activities.index(connection, {
        todoId: todo.id,
        body: {
          direction: "desc",
        } satisfies ITodoAppTodoActivity.IRequest,
      });
    },
  );
}
