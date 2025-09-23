import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppAccountDeletionRequest } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAccountDeletionRequest";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_account_deletion_request_detail_cross_user_denied(
  connection: api.IConnection,
) {
  /**
   * Validate that an authenticated user cannot access another user's account
   * deletion request detail by ID, while the owner can access it.
   *
   * Steps:
   *
   * 1. Create two independent authenticated contexts (userA, userB) via join.
   * 2. As userB, create an account deletion request and capture its ID.
   * 3. As userA, attempt to GET userB's request by ID -> expect an error.
   * 4. As userB, GET the same request by ID -> expect success and validate
   *    ownership.
   */

  // Create isolated connections so that SDK-managed Authorization headers don't conflict
  const connA: api.IConnection = { ...connection, headers: {} };
  const connB: api.IConnection = { ...connection, headers: {} };

  // 1) Join userA
  const joinBodyA = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const userA = await api.functional.auth.todoUser.join(connA, {
    body: joinBodyA,
  });
  typia.assert(userA);

  // 1) Join userB
  const joinBodyB = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const userB = await api.functional.auth.todoUser.join(connB, {
    body: joinBodyB,
  });
  typia.assert(userB);

  // 2) userB creates an account deletion request
  const createReqBodyB = {
    reason: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ITodoAppAccountDeletionRequest.ICreate;
  const createdByB =
    await api.functional.todoApp.todoUser.users.accountDeletionRequests.create(
      connB,
      {
        userId: userB.id,
        body: createReqBodyB,
      },
    );
  typia.assert(createdByB);

  // 3) userA attempts to read userB's deletion request -> should be denied
  await TestValidator.error(
    "cross-user access must be denied for account deletion request detail",
    async () => {
      await api.functional.todoApp.todoUser.accountDeletionRequests.at(connA, {
        accountDeletionRequestId: createdByB.id,
      });
    },
  );

  // 4) userB successfully reads own deletion request -> validate identity & ownership
  const readByOwner =
    await api.functional.todoApp.todoUser.accountDeletionRequests.at(connB, {
      accountDeletionRequestId: createdByB.id,
    });
  typia.assert(readByOwner);

  // Validate ownership and identity
  TestValidator.equals(
    "owner id on record must equal userB.id",
    readByOwner.todo_app_user_id,
    userB.id,
  );
  TestValidator.equals(
    "returned id must equal created request id",
    readByOwner.id,
    createdByB.id,
  );
}
