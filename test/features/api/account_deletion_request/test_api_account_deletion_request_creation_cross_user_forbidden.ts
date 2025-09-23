import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppAccountDeletionRequest } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAccountDeletionRequest";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Cross-user account deletion request creation must be forbidden.
 *
 * Business goal: validate that a todoUser cannot initiate an account deletion
 * request on behalf of a different user. Ownership must be enforced between the
 * authenticated subject and the path parameter userId.
 *
 * Test flow:
 *
 * 1. Join as userB (to obtain userB.id to be used as the target in the path)
 * 2. Join as userA (ensuring the active token on connection belongs to userA)
 * 3. Attempt POST /todoApp/todoUser/users/{userId}/accountDeletionRequests with
 *    userId = userB.id while authenticated as userA
 * 4. Expect an error (authorization-safe denial). Do not assert status codes.
 */
export async function test_api_account_deletion_request_creation_cross_user_forbidden(
  connection: api.IConnection,
) {
  // 1) Join as userB (target in the path)
  const userB = await api.functional.auth.todoUser.join(connection, {
    body: typia.random<ITodoAppTodoUser.ICreate>(),
  });
  typia.assert(userB);

  // 2) Join as userA (actor) — last join sets Authorization to userA
  const userA = await api.functional.auth.todoUser.join(connection, {
    body: typia.random<ITodoAppTodoUser.ICreate>(),
  });
  typia.assert(userA);

  // Sanity: users must be distinct
  TestValidator.notEquals(
    "userA and userB must be different accounts",
    userA.id,
    userB.id,
  );

  // 3) Build a valid request body for deletion request creation
  const deletionBody = {
    reason: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ITodoAppAccountDeletionRequest.ICreate;

  // 4) Cross-user attempt: authenticated as userA, path userId is userB.id
  await TestValidator.error(
    "cross-user account deletion request creation must be forbidden",
    async () => {
      await api.functional.todoApp.todoUser.users.accountDeletionRequests.create(
        connection,
        {
          userId: userB.id,
          body: deletionBody,
        },
      );
    },
  );
}
