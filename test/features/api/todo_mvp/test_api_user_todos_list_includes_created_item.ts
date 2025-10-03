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
 * List shows the authenticated user's created Todo.
 *
 * Purpose
 *
 * - Ensure that GET /todoMvp/user/todos returns only the current user’s Todos and
 *   includes newly created items.
 *
 * Flow
 *
 * 1. Join as a new user (SDK sets Authorization automatically)
 * 2. Create a Todo with a valid short title (ITodoMvpTodo.ICreate)
 * 3. List Todos (IPageITodoMvpTodo) and assert it contains the created item
 * 4. Negative: unauthenticated listing call should error
 * 5. Ownership scope: join as a second user and verify the first user’s Todo is
 *    not listed
 */
export async function test_api_user_todos_list_includes_created_item(
  connection: api.IConnection,
) {
  // 1) Join as a new user
  const userJoin = await api.functional.auth.user.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoMvpUser.ICreate,
  });
  typia.assert(userJoin);

  // 2) Create a Todo with a valid title (kept short to satisfy MaxLength<120>)
  const createBody = {
    title: RandomGenerator.paragraph({ sentences: 3, wordMin: 3, wordMax: 6 }),
  } satisfies ITodoMvpTodo.ICreate;
  const created = await api.functional.todoMvp.user.todos.create(connection, {
    body: createBody,
  });
  typia.assert(created);

  // 3) List Todos and assert the created Todo exists
  const page = await api.functional.todoMvp.user.todos.get(connection);
  typia.assert(page);

  const found = page.data.find((t) => t.id === created.id);
  await TestValidator.predicate(
    "created todo should be present in the authenticated user's list",
    async () => found !== undefined,
  );
  if (found !== undefined) {
    // Core field equality checks
    TestValidator.equals(
      "listed todo id should equal created id",
      found.id,
      created.id,
    );
    TestValidator.equals(
      "listed todo title should equal created title",
      found.title,
      created.title,
    );
    TestValidator.equals(
      "listed todo status should equal created status",
      found.status,
      created.status,
    );
  }

  // 4) Negative: unauthenticated listing should error
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated GET /todoMvp/user/todos should fail",
    async () => {
      await api.functional.todoMvp.user.todos.get(unauthConn);
    },
  );

  // 5) Ownership scope: second user should not see first user's Todos
  const secondUser = await api.functional.auth.user.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoMvpUser.ICreate,
  });
  typia.assert(secondUser);

  const secondPage = await api.functional.todoMvp.user.todos.get(connection);
  typia.assert(secondPage);

  const foundInSecond = secondPage.data.find((t) => t.id === created.id);
  await TestValidator.predicate(
    "second user should not see first user's created todo",
    async () => foundInSecond === undefined,
  );
}
