import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_todo_creation_success_with_optional_fields(
  connection: api.IConnection,
) {
  /**
   * 1. Authenticate as a todoUser via join
   * 2. Create a Todo with optional description and due_at
   * 3. Validate server defaults (status "open", completed_at null), ownership, and
   *    echo
   * 4. Create a boundary/minimal Todo (title length = 1) with explicit null
   *    optional fields
   * 5. Validate the same business rules and null echoing
   */

  // 1) Authenticate (join) as todoUser
  const email = typia.random<string & tags.Format<"email">>();
  const password = typia.random<
    string & tags.MinLength<8> & tags.MaxLength<64>
  >();
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: {
      email,
      password,
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authorized);

  // 2) Create a Todo with optional description and due_at
  const titleLength = typia.random<
    number & tags.Type<"uint32"> & tags.Minimum<1> & tags.Maximum<120>
  >();
  const title = RandomGenerator.alphabets(titleLength);
  const description = RandomGenerator.paragraph({ sentences: 20 });
  const dueAtIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const createBody1 = {
    title,
    description,
    due_at: dueAtIso,
  } satisfies ITodoAppTodo.ICreate;

  const created1 = await api.functional.todoApp.todoUser.todos.create(
    connection,
    {
      body: createBody1,
    },
  );
  typia.assert(created1);

  // Business validations for the first creation
  TestValidator.equals(
    "owner id equals the authenticated subject id",
    created1.todo_app_user_id,
    authorized.id,
  );
  TestValidator.equals("status is 'open' on creation", created1.status, "open");
  TestValidator.equals(
    "completed_at is null on creation",
    created1.completed_at ?? null,
    null,
  );
  TestValidator.equals("title echoes input", created1.title, title);
  TestValidator.equals(
    "description echoes input",
    created1.description ?? null,
    description,
  );
  TestValidator.equals(
    "due_at echoes input",
    created1.due_at ?? null,
    dueAtIso,
  );

  // 4) Create a boundary/minimal Todo: title length = 1, optional fields explicitly null
  const minTitle = RandomGenerator.alphabets(1);
  const createBody2 = {
    title: minTitle,
    description: null,
    due_at: null,
  } satisfies ITodoAppTodo.ICreate;

  const created2 = await api.functional.todoApp.todoUser.todos.create(
    connection,
    {
      body: createBody2,
    },
  );
  typia.assert(created2);

  // Business validations for the second creation
  TestValidator.equals(
    "owner id equals the authenticated subject id (min title case)",
    created2.todo_app_user_id,
    authorized.id,
  );
  TestValidator.equals(
    "status is 'open' on creation (min title case)",
    created2.status,
    "open",
  );
  TestValidator.equals(
    "completed_at is null on creation (min title case)",
    created2.completed_at ?? null,
    null,
  );
  TestValidator.equals(
    "title echoes input (min title case)",
    created2.title,
    minTitle,
  );
  TestValidator.equals(
    "description is null when passed null",
    created2.description ?? null,
    null,
  );
  TestValidator.equals(
    "due_at is null when passed null",
    created2.due_at ?? null,
    null,
  );
}
