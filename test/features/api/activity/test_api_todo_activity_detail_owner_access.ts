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
 * Owner can retrieve a specific activity record for their Todo, and isolation
 * is enforced.
 *
 * Steps:
 *
 * 1. Register (join) a todoUser and get authorized context (token auto-handled by
 *    SDK)
 * 2. Create a Todo (title only) — implicitly generates a 'create' activity
 * 3. List activities for the Todo to discover a valid activityId (prefer 'create')
 * 4. Read activity detail by (todoId, activityId)
 * 5. Validate core fields and ownership: todo reference matches when present; not
 *    soft-deleted; activity_type within allowed values
 * 6. Validate filter behavior: listing with activity_types: ['create'] returns
 *    only 'create'
 * 7. Ownership isolation: second user cannot access first user’s activity detail
 */
export async function test_api_todo_activity_detail_owner_access(
  connection: api.IConnection,
) {
  // 1) Join as owner user (token bound automatically)
  const ownerAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: typia.random<ITodoAppTodoUser.ICreate>(),
    });
  typia.assert(ownerAuth);

  // 2) Create a Todo (simple, valid title)
  const createTodoBody = {
    title: RandomGenerator.paragraph({ sentences: 3, wordMin: 3, wordMax: 8 }),
  } satisfies ITodoAppTodo.ICreate;
  const todo: ITodoAppTodo = await api.functional.todoApp.todoUser.todos.create(
    connection,
    { body: createTodoBody },
  );
  typia.assert(todo);

  // 3) List activities and capture a valid activityId
  const listReq = {
    page: 1,
    limit: 10,
    sort: "occurred_at",
    direction: "desc",
  } satisfies ITodoAppTodoActivity.IRequest;
  const page: IPageITodoAppTodoActivity.ISummary =
    await api.functional.todoApp.todoUser.todos.activities.index(connection, {
      todoId: todo.id,
      body: listReq,
    });
  typia.assert(page);

  TestValidator.predicate(
    "activities listing should contain at least one record",
    page.data.length > 0,
  );

  const preferred: ITodoAppTodoActivity.ISummary | undefined = page.data.find(
    (s) => s.activity_type === "create",
  );
  const summary: ITodoAppTodoActivity.ISummary = preferred ?? page.data[0]!;

  // 4) Fetch activity detail
  const activity: ITodoAppTodoActivity =
    await api.functional.todoApp.todoUser.todos.activities.at(connection, {
      todoId: todo.id,
      activityId: summary.id,
    });
  typia.assert(activity);

  // 5) Business validations
  // 5-1) If todo FK exists, it must match the requested todo
  if (
    activity.todo_app_todo_id !== null &&
    activity.todo_app_todo_id !== undefined
  ) {
    TestValidator.equals(
      "activity.todo_app_todo_id should match requested todo.id",
      activity.todo_app_todo_id,
      todo.id,
    );
  }
  // 5-2) Core fields should be meaningful
  TestValidator.predicate(
    "activity_type must be one of allowed values",
    (
      [
        "create",
        "update",
        "complete",
        "reopen",
        "delete",
      ] as const as readonly string[]
    ).includes(activity.activity_type),
  );
  TestValidator.predicate(
    "occurred_at must be a non-empty ISO string",
    activity.occurred_at.length > 0,
  );
  TestValidator.predicate(
    "activity must not be soft-deleted in normal view",
    activity.deleted_at === null || activity.deleted_at === undefined,
  );

  // 6) Listing with filter: only 'create' types
  const filtered: IPageITodoAppTodoActivity.ISummary =
    await api.functional.todoApp.todoUser.todos.activities.index(connection, {
      todoId: todo.id,
      body: {
        page: 1,
        limit: 10,
        activity_types: ["create"],
        sort: "occurred_at",
        direction: "desc",
      } satisfies ITodoAppTodoActivity.IRequest,
    });
  typia.assert(filtered);
  TestValidator.predicate(
    "filtered listing returns only 'create' activities (if any exist)",
    filtered.data.every((d) => d.activity_type === "create"),
  );

  // 7) Ownership isolation: another user cannot access this activity
  const otherAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: typia.random<ITodoAppTodoUser.ICreate>(),
    });
  typia.assert(otherAuth);

  await TestValidator.error(
    "non-owner cannot access other's activity detail",
    async () => {
      await api.functional.todoApp.todoUser.todos.activities.at(connection, {
        todoId: todo.id,
        activityId: activity.id,
      });
    },
  );
}
