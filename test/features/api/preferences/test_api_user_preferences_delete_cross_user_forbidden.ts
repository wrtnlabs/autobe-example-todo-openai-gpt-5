import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Verify cross-user deletion of preferences is forbidden.
 *
 * Business goal:
 *
 * - Ensure only the owning todoUser can delete their preferences. Cross-user
 *   attempts must be denied without leaking target existence.
 *
 * Steps:
 *
 * 1. Create User A (join) using the main connection; Authorization becomes A.
 * 2. Create User B (join) using an isolated connection so the main connection
 *    remains A.
 * 3. As User A, attempt to DELETE B's preferences and expect an error.
 * 4. As User B, DELETE B's preferences successfully (void, idempotent allowed).
 */
export async function test_api_user_preferences_delete_cross_user_forbidden(
  connection: api.IConnection,
) {
  // 1) Create and authenticate User A on main connection
  const joinABody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const userA = await api.functional.auth.todoUser.join(connection, {
    body: joinABody,
  });
  typia.assert(userA);

  // 2) Create isolated connection to create User B without switching A's token
  const bConn: api.IConnection = { ...connection, headers: {} };
  const joinBBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const userB = await api.functional.auth.todoUser.join(bConn, {
    body: joinBBody,
  });
  typia.assert(userB);

  // Sanity: ensure different users
  TestValidator.notEquals(
    "user A and user B must be different",
    userA.id,
    userB.id,
  );

  // 3) As User A, try to delete B's preferences -> must fail
  await TestValidator.error(
    "cross-user deletion must be forbidden",
    async () => {
      await api.functional.todoApp.todoUser.users.preferences.erase(
        connection,
        {
          userId: userB.id,
        },
      );
    },
  );

  // 4) As User B, deleting own preferences should succeed (void response)
  await api.functional.todoApp.todoUser.users.preferences.erase(bConn, {
    userId: userB.id,
  });
}
