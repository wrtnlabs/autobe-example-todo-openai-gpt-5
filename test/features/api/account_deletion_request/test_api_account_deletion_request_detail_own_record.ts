import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppAccountDeletionRequest } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAccountDeletionRequest";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_account_deletion_request_detail_own_record(
  connection: api.IConnection,
) {
  /**
   * Validate that a todoUser can fetch details of their own account deletion
   * request by ID.
   *
   * Steps:
   *
   * 1. Join as todoUser (capture owner id)
   * 2. Create an account deletion request with an explicit reason
   * 3. Read the request by its id in the same authenticated context
   * 4. Validate ownership, identity, status, timestamps, and not-deleted state
   * 5. Negative: switch to another user and ensure access to the first user’s
   *    record fails
   * 6. Switch back to original user and confirm access still succeeds
   */

  // 1) Join as todoUser (owner)
  const joinBody1 = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const me1: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBody1 });
  typia.assert(me1);

  // 2) Create a deletion request for this user
  const createBody1 = {
    reason: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ITodoAppAccountDeletionRequest.ICreate;
  const created: ITodoAppAccountDeletionRequest =
    await api.functional.todoApp.todoUser.users.accountDeletionRequests.create(
      connection,
      {
        userId: me1.id,
        body: createBody1,
      },
    );
  typia.assert(created);

  // 3) Read the request by id (same user context)
  const detail1: ITodoAppAccountDeletionRequest =
    await api.functional.todoApp.todoUser.accountDeletionRequests.at(
      connection,
      { accountDeletionRequestId: created.id },
    );
  typia.assert(detail1);

  // 4) Validations: ownership, identity, status, timestamps, not deleted
  TestValidator.equals(
    "detail id should equal created id",
    detail1.id,
    created.id,
  );
  TestValidator.equals(
    "created ownership should match authenticated user",
    created.todo_app_user_id,
    me1.id,
  );
  TestValidator.equals(
    "detail ownership should match authenticated user",
    detail1.todo_app_user_id,
    me1.id,
  );
  TestValidator.equals(
    "reason should be echoed in the read result",
    detail1.reason,
    createBody1.reason,
  );
  TestValidator.predicate(
    "status should be non-empty",
    typeof detail1.status === "string" && detail1.status.length > 0,
  );
  TestValidator.predicate(
    "record must not be logically deleted",
    detail1.deleted_at === null || detail1.deleted_at === undefined,
  );
  TestValidator.predicate(
    "updated_at must be same or later than created_at",
    Date.parse(detail1.updated_at) >= Date.parse(detail1.created_at),
  );

  // 5) Negative: other user must not access this record
  const joinBody2 = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const me2: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBody2 });
  typia.assert(me2);

  await TestValidator.error(
    "another user should be denied when fetching someone else's deletion request",
    async () => {
      await api.functional.todoApp.todoUser.accountDeletionRequests.at(
        connection,
        { accountDeletionRequestId: created.id },
      );
    },
  );

  // 6) Switch back to original user and confirm access still works
  const me1Again: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBody1 });
  typia.assert(me1Again);

  const detail1Again: ITodoAppAccountDeletionRequest =
    await api.functional.todoApp.todoUser.accountDeletionRequests.at(
      connection,
      { accountDeletionRequestId: created.id },
    );
  typia.assert(detail1Again);
  TestValidator.equals(
    "reloaded detail id still matches created id",
    detail1Again.id,
    created.id,
  );
}
