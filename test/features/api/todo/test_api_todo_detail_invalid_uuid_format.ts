import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Validate rejection on malformed UUID for todo detail endpoint.
 *
 * Steps:
 *
 * 1. Register (join) a todoUser to obtain authenticated session
 * 2. Call GET /todoApp/todoUser/todos/{todoId} with an invalid UUID string
 * 3. Verify the API rejects the request (error thrown) due to invalid UUID format
 *
 * Notes:
 *
 * - Do not assert specific HTTP status codes; only verify an error occurs
 * - Do not manipulate connection.headers; SDK handles auth automatically
 */
export async function test_api_todo_detail_invalid_uuid_format(
  connection: api.IConnection,
) {
  // 1) Join as todoUser (dependency setup)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // 8–64 chars
  } satisfies ITodoAppTodoUser.ICreate;

  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);

  // 2) Prepare invalid UUID id
  const invalidTodoId = "not-a-uuid";

  // 3) Expect error when calling detail with malformed todoId
  await TestValidator.error(
    "rejects malformed todoId UUID (input validation)",
    async () => {
      await api.functional.todoApp.todoUser.todos.at(connection, {
        todoId: invalidTodoId,
      });
    },
  );
}
