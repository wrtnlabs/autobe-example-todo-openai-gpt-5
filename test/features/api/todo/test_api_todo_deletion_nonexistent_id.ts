import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";

export async function test_api_todo_deletion_nonexistent_id(
  connection: api.IConnection,
) {
  /**
   * Validate that deleting a non-existent Todo ID fails and RBAC is enforced.
   *
   * Steps:
   *
   * 1. Try to delete with an unauthenticated connection → should error (RBAC).
   * 2. Register a new user (authentication token handled by SDK).
   * 3. Try to delete a random UUID as authenticated user → should error
   *    (non-existent).
   */

  // 1) Unauthenticated deletion attempt must fail (RBAC enforcement)
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated user cannot delete todo",
    async () => {
      await api.functional.todoMvp.user.todos.erase(unauthConn, {
        todoId: typia.random<string & tags.Format<"uuid">>(),
      });
    },
  );

  // 2) Register (join) a new user and assert authorization payload
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoMvpUser.ICreate;
  const authorized = await api.functional.auth.user.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);

  // 3) Deleting a non-existent Todo ID must fail without disclosing details
  await TestValidator.error(
    "deleting non-existent todo id should fail",
    async () => {
      await api.functional.todoMvp.user.todos.erase(connection, {
        todoId: typia.random<string & tags.Format<"uuid">>(),
      });
    },
  );
}
