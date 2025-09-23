import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Verify cross-user profile deletion is forbidden.
 *
 * Steps:
 *
 * 1. Register User A (join) on the main connection so it stays authenticated as A.
 * 2. Register User B using a separate cloned connection to avoid overwriting A's
 *    token.
 * 3. While authenticated as A, attempt DELETE
 *    /todoApp/todoUser/users/{userId=B}/profile.
 *
 * Expectations:
 *
 * - The cross-user deletion attempt must fail without inspecting specific HTTP
 *   status codes.
 * - No header tampering other than creating an isolated connection for B.
 */
export async function test_api_user_profile_delete_cross_user_forbidden(
  connection: api.IConnection,
) {
  // 1) Create and authenticate User A on the main connection
  const bodyA = typia.random<ITodoAppTodoUser.ICreate>();
  const userA = await api.functional.auth.todoUser.join(connection, {
    body: bodyA,
  });
  typia.assert(userA);

  // 2) Create User B on an isolated connection to avoid switching away from A
  const bConn: api.IConnection = { ...connection, headers: {} }; // allowed pattern for unauthenticated conn
  const bodyB = typia.random<ITodoAppTodoUser.ICreate>();
  const userB = await api.functional.auth.todoUser.join(bConn, { body: bodyB });
  typia.assert(userB);

  // Sanity: ensure we actually have two distinct users
  TestValidator.notEquals(
    "distinct users: User A and User B must differ",
    userA.id,
    userB.id,
  );

  // 3) While authenticated as A, attempt to delete B's profile → must fail
  await TestValidator.error(
    "cross-user profile deletion must be denied",
    async () =>
      await api.functional.todoApp.todoUser.users.profile.erase(connection, {
        userId: userB.id,
      }),
  );
}
