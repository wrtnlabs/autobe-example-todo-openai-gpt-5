import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { IETodoMvpTodoStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IETodoMvpTodoStatus";
import type { ITodoMvpTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpTodo";
import type { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";

/**
 * Validate owner-only access for Todo detail endpoint.
 *
 * This test ensures that:
 *
 * 1. A newly registered user (A) can create a Todo and retrieve its full detail
 *    via GET /todoMvp/user/todos/{todoId}.
 * 2. Another user (B) cannot access A's Todo detail. The API should deny or behave
 *    as not-found without leaking ownership information.
 *
 * Steps:
 *
 * 1. Join as user A to obtain an authenticated session.
 * 2. Create a Todo under user A using POST /todoMvp/user/todos.
 * 3. Read the Todo detail as user A; verify id, title, and initial status.
 * 4. Join as user B (switch session) and attempt to read A's Todo; expect error.
 */
export async function test_api_todo_detail_access_control(
  connection: api.IConnection,
) {
  // 1) Join as user A (owner)
  const owner = await api.functional.auth.user.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoMvpUser.ICreate,
  });
  typia.assert(owner);

  // 2) Create a Todo under user A
  const createBody = {
    title: RandomGenerator.paragraph({ sentences: 3 }),
    notes: RandomGenerator.paragraph({ sentences: 10 }),
    due_date: null,
  } satisfies ITodoMvpTodo.ICreate;

  const created = await api.functional.todoMvp.user.todos.create(connection, {
    body: createBody,
  });
  typia.assert(created);

  // Initial state validations for created Todo
  TestValidator.equals(
    "created todo status should be 'open'",
    created.status,
    "open",
  );

  // 3) Positive retrieval by the owner A
  const ownRead = await api.functional.todoMvp.user.todos.at(connection, {
    todoId: created.id,
  });
  typia.assert(ownRead);

  TestValidator.equals(
    "owner read returns the same id",
    ownRead.id,
    created.id,
  );
  TestValidator.equals(
    "owner read title matches created title",
    ownRead.title,
    createBody.title,
  );
  TestValidator.equals(
    "owner read status remains 'open'",
    ownRead.status,
    "open",
  );

  // 4) Join as user B (non-owner) and attempt cross-user access
  const intruder = await api.functional.auth.user.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoMvpUser.ICreate,
  });
  typia.assert(intruder);

  await TestValidator.error(
    "non-owner cannot access another user's todo detail",
    async () => {
      await api.functional.todoMvp.user.todos.at(connection, {
        todoId: created.id,
      });
    },
  );
}
