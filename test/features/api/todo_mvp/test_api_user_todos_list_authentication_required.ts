import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IETodoMvpTodoStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IETodoMvpTodoStatus";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoMvpTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoMvpTodo";
import type { ITodoMvpTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpTodo";

/**
 * Ensure listing Todos requires authentication.
 *
 * Business goal:
 *
 * - GET /todoMvp/user/todos must reject unauthenticated requests
 * - Authenticated requests should succeed and return a page of todos
 *
 * Test flow:
 *
 * 1. Build an unauthenticated connection by cloning the provided connection and
 *    replacing headers with an empty object.
 * 2. Attempt to list todos with the unauthenticated connection and expect an error
 *    (do not validate specific status codes).
 *
 *    - If the SDK is in simulation mode, skip the error expectation and only
 *         validate that the endpoint returns a properly shaped response, as
 *         mocks may not enforce authentication.
 * 3. Call the endpoint again using the original (assumed authenticated) connection
 *    and assert the response type using typia.assert.
 */
export async function test_api_user_todos_list_authentication_required(
  connection: api.IConnection,
) {
  // 1) Create an unauthenticated connection (allowed pattern: clone and set empty headers)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 2) Expect unauthenticated access to fail, except when simulate mode is enabled
  if (connection.simulate === true) {
    // In simulation mode, SDK returns mock data and may not enforce auth
    const mockPage = await api.functional.todoMvp.user.todos.get(unauthConn);
    typia.assert(mockPage);
  } else {
    await TestValidator.error(
      "unauthenticated access must be rejected",
      async () => {
        await api.functional.todoMvp.user.todos.get(unauthConn);
      },
    );
  }

  // 3) Authenticated success path using the original connection
  const page = await api.functional.todoMvp.user.todos.get(connection);
  typia.assert(page);
}
