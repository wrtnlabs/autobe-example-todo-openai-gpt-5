import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Verify Todo creation requires authentication and succeeds after joining.
 *
 * Steps:
 *
 * 1. Create an unauthenticated connection clone (headers: {}). Attempt to create a
 *    Todo with valid payload → expect an error.
 * 2. Register (join) a todoUser; SDK sets Authorization on the main connection.
 * 3. Create a Todo with the authenticated connection → expect success.
 * 4. Validate ownership and initial state (status 'open', no completion timestamp)
 *    and echo of input title.
 */
export async function test_api_todo_creation_unauthorized_access(
  connection: api.IConnection,
) {
  // 1) Prepare unauthenticated connection and attempt creation → must error
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  const unauthCreateBody = typia.random<ITodoAppTodo.ICreate>();
  await TestValidator.error(
    "creating todo without authentication must fail",
    async () => {
      await api.functional.todoApp.todoUser.todos.create(unauthConn, {
        body: unauthCreateBody,
      });
    },
  );

  // 2) Join (authenticate) a new todoUser - SDK sets Authorization on `connection`
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

  // 3) Authenticated creation should succeed
  const createBody = typia.random<ITodoAppTodo.ICreate>();
  const created: ITodoAppTodo =
    await api.functional.todoApp.todoUser.todos.create(connection, {
      body: createBody,
    });
  typia.assert(created);

  // 4) Business validations
  TestValidator.equals(
    "owner id of created todo must be the authenticated user",
    created.todo_app_user_id,
    authorized.id,
  );
  TestValidator.equals(
    "title should match the input payload",
    created.title,
    createBody.title,
  );
  TestValidator.equals(
    "newly created todo status must be 'open'",
    created.status,
    "open",
  );
  TestValidator.predicate(
    "completed_at must be null or undefined on creation",
    created.completed_at === null || created.completed_at === undefined,
  );
}
