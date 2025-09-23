import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppAccountDeletionRequest } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAccountDeletionRequest";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Deny cross-user access when reading account deletion requests.
 *
 * This scenario ensures that a todoUser cannot retrieve another user's account
 * deletion request record via the detail endpoint. It proceeds as follows:
 *
 * 1. Create two members (userA and userB) using the join endpoint, each on its own
 *    cloned connection so their sessions don't clash.
 * 2. Under userB, create an account deletion request and remember its id.
 * 3. As a positive control, verify the owner (userB) can read the request.
 * 4. As a negative test, while authenticated as userA, attempt to read the request
 *    in two ways and expect denial without leaking existence:
 *
 *    - Path userId=userA with accountDeletionRequestId belonging to userB
 *    - Path userId=userB with accountDeletionRequestId belonging to userB
 */
export async function test_api_account_deletion_request_detail_cross_user_not_found(
  connection: api.IConnection,
) {
  // Prepare two independent authenticated sessions without manually touching headers
  const connA: api.IConnection = { ...connection, headers: {} };
  const connB: api.IConnection = { ...connection, headers: {} };

  // 1) userA joins
  const userA = await api.functional.auth.todoUser.join(connA, {
    body: typia.random<ITodoAppTodoUser.ICreate>(),
  });
  typia.assert(userA);

  // 2) userB joins
  const userB = await api.functional.auth.todoUser.join(connB, {
    body: typia.random<ITodoAppTodoUser.ICreate>(),
  });
  typia.assert(userB);

  // 3) Under userB, create an account deletion request
  const createBody = {
    reason: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ITodoAppAccountDeletionRequest.ICreate;

  const created =
    await api.functional.todoApp.todoUser.users.accountDeletionRequests.create(
      connB,
      {
        userId: userB.id,
        body: createBody,
      },
    );
  typia.assert(created);
  TestValidator.equals(
    "created request should be owned by userB",
    created.todo_app_user_id,
    userB.id,
  );

  // Positive control: owner can read the created request
  const byOwner =
    await api.functional.todoApp.todoUser.users.accountDeletionRequests.at(
      connB,
      {
        userId: userB.id,
        accountDeletionRequestId: created.id,
      },
    );
  typia.assert(byOwner);
  TestValidator.equals(
    "owner can read own request: id matches",
    byOwner.id,
    created.id,
  );

  // 4-a) Cross-user denial: path userId=userA with B's request id
  await TestValidator.error(
    "cross-user mismatch path: userA cannot fetch B's deletion request via userA path",
    async () => {
      await api.functional.todoApp.todoUser.users.accountDeletionRequests.at(
        connA,
        {
          userId: userA.id,
          accountDeletionRequestId: created.id,
        },
      );
    },
  );

  // 4-b) Cross-user denial: path userId=userB while authenticated as userA
  await TestValidator.error(
    "cross-user direct access: userA cannot fetch userB's deletion request",
    async () => {
      await api.functional.todoApp.todoUser.users.accountDeletionRequests.at(
        connA,
        {
          userId: userB.id,
          accountDeletionRequestId: created.id,
        },
      );
    },
  );
}
