import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { IETodoMvpTodoStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IETodoMvpTodoStatus";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoMvpTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoMvpTodo";
import type { ITodoMvpTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpTodo";
import type { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";

/**
 * Validate empty-state listing for a brand new user.
 *
 * Business context:
 *
 * - GET /todoMvp/user/todos requires authentication and returns only the caller's
 *   Todos.
 * - A freshly registered user should have no Todos; therefore, the list must be
 *   empty.
 *
 * Steps:
 *
 * 1. Register a new user via POST /auth/user/join to obtain an authenticated
 *    session.
 * 2. Immediately call GET /todoMvp/user/todos.
 * 3. Validate: pagination metadata exists (type-checked by typia.assert), data is
 *    an empty array, records is 0, and pages is 0 (ceil(0/limit) = 0).
 */
export async function test_api_user_todos_list_empty_state(
  connection: api.IConnection,
) {
  // 1) Register a new user (join) to obtain an authenticated session
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoMvpUser.ICreate;
  const authorized: ITodoMvpUser.IAuthorized =
    await api.functional.auth.user.join(connection, { body: joinBody });
  typia.assert<ITodoMvpUser.IAuthorized>(authorized);

  // 2) List Todos for the authenticated user
  const page: IPageITodoMvpTodo =
    await api.functional.todoMvp.user.todos.get(connection);
  typia.assert<IPageITodoMvpTodo>(page);

  // 3) Business logic validations for empty-state
  TestValidator.equals(
    "newly registered user has no todos: data length is 0",
    page.data.length,
    0,
  );
  TestValidator.equals(
    "newly registered user has no todos: total records is 0",
    page.pagination.records,
    0,
  );
  TestValidator.equals(
    "when no records, total pages equals 0",
    page.pagination.pages,
    0,
  );
}
