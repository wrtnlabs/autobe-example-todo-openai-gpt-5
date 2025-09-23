import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppAccountDeletionRequest } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAccountDeletionRequest";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_account_deletion_request_creation_conflict_existing_pending(
  connection: api.IConnection,
) {
  // 1) Join as a todoUser (authentication handled by SDK)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // 8–64 chars policy satisfied
  } satisfies ITodoAppTodoUser.ICreate;

  const auth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBody });
  typia.assert(auth);

  // 2) Create first account deletion request
  const createBody1 = {
    reason: RandomGenerator.paragraph({ sentences: 4 }),
  } satisfies ITodoAppAccountDeletionRequest.ICreate;

  const first: ITodoAppAccountDeletionRequest =
    await api.functional.todoApp.todoUser.users.accountDeletionRequests.create(
      connection,
      {
        userId: auth.id,
        body: createBody1,
      },
    );
  typia.assert(first);

  // Validate ownership integrity
  TestValidator.equals(
    "created deletion request belongs to authenticated user",
    first.todo_app_user_id,
    auth.id,
  );

  // 3) Attempt to create a second overlapping request -> expect business error
  const createBody2 = {
    reason: RandomGenerator.paragraph({ sentences: 3 }),
  } satisfies ITodoAppAccountDeletionRequest.ICreate;

  await TestValidator.error(
    "second deletion request should be rejected when one is pending/scheduled",
    async () => {
      await api.functional.todoApp.todoUser.users.accountDeletionRequests.create(
        connection,
        {
          userId: auth.id,
          body: createBody2,
        },
      );
    },
  );
}
