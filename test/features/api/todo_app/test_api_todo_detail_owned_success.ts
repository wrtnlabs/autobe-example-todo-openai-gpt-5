import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_todo_detail_owned_success(
  connection: api.IConnection,
) {
  /**
   * Validate that an authenticated todoUser can create a Todo and fetch its
   * detail by id, with correct ownership and field integrity.
   *
   * Steps
   *
   * 1. Register (join) a todoUser
   * 2. Create a Todo with title/description/due_at
   * 3. GET the Todo by id
   * 4. Validate ownership and that fields match creation (status 'open',
   *    completed_at nullish)
   */
  // 1) Join as todoUser (register + authenticate)
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12);

  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email,
        password,
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(authorized);

  // 2) Create a Todo
  const rawTitle: string = RandomGenerator.paragraph({ sentences: 3 });
  const title: string =
    rawTitle.length > 120 ? rawTitle.slice(0, 120).trim() : rawTitle;
  const description: string = RandomGenerator.paragraph({ sentences: 12 });
  const dueAtIso: string = new Date(
    RandomGenerator.date(new Date(), 1000 * 60 * 60 * 24 * 30), // within 30 days
  ).toISOString();

  const created: ITodoAppTodo =
    await api.functional.todoApp.todoUser.todos.create(connection, {
      body: {
        title,
        description,
        due_at: dueAtIso,
      } satisfies ITodoAppTodo.ICreate,
    });
  typia.assert(created);

  // Validate server-populated fields on creation
  TestValidator.equals(
    "owner id equals caller id (creation)",
    created.todo_app_user_id,
    authorized.id,
  );
  TestValidator.equals("status is 'open' on creation", created.status, "open");
  TestValidator.predicate(
    "completed_at is nullish on creation",
    created.completed_at === null || created.completed_at === undefined,
  );

  // 3) GET detail by id
  const detail: ITodoAppTodo = await api.functional.todoApp.todoUser.todos.at(
    connection,
    { todoId: created.id },
  );
  typia.assert(detail);

  // 4) Validate ownership and field integrity
  TestValidator.equals("detail id matches created id", detail.id, created.id);
  TestValidator.equals(
    "detail owner id equals caller id",
    detail.todo_app_user_id,
    authorized.id,
  );
  TestValidator.equals("title preserved", detail.title, title);
  TestValidator.equals(
    "description preserved",
    detail.description,
    description,
  );
  TestValidator.equals("due_at preserved", detail.due_at, dueAtIso);
  TestValidator.equals("status remains open", detail.status, "open");
  TestValidator.predicate(
    "completed_at remains nullish",
    detail.completed_at === null || detail.completed_at === undefined,
  );

  // Timestamps present (formats guaranteed by typia.assert)
  TestValidator.predicate("created_at exists", !!detail.created_at);
  TestValidator.predicate("updated_at exists", !!detail.updated_at);
}
