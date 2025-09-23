import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppTodo";
import type { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";

/**
 * Ensure unauthenticated access is rejected for listing Todos.
 *
 * Business goal: The listing endpoint for a todoUser must enforce
 * authentication. A request without an Authorization header must fail.
 *
 * Steps:
 *
 * 1. Build an unauthenticated connection by cloning the provided connection and
 *    setting headers to an empty object (allowed pattern).
 * 2. Call PATCH /todoApp/todoUser/todos with a valid ITodoAppTodo.IRequest body.
 * 3. Validate that the call throws an error using TestValidator.error.
 *
 * Notes:
 *
 * - Do NOT validate specific HTTP status codes. Only assert that an error occurs.
 * - Do NOT manipulate headers beyond creating an empty headers object.
 */
export async function test_api_todo_list_unauthorized_access(
  connection: api.IConnection,
) {
  // 1) Create an explicit unauthenticated connection (allowed pattern)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 2) Prepare a valid request body for listing/searching todos
  const requestBody = {
    page: 1,
    limit: 20,
    status: "all",
    due_filter: null,
    sort: null,
    direction: "desc",
    search: null,
  } satisfies ITodoAppTodo.IRequest;

  // 3) Expect the unauthenticated call to fail
  await TestValidator.error(
    "unauthenticated todo list request must be rejected",
    async () => {
      await api.functional.todoApp.todoUser.todos.index(unauthConn, {
        body: requestBody,
      });
    },
  );
}
