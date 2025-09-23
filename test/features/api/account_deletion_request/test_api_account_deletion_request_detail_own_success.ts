import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppAccountDeletionRequest } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAccountDeletionRequest";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Authenticated user retrieves their own account deletion request detail.
 *
 * Steps:
 *
 * 1. Join as a todoUser and capture userId.
 * 2. Create an account deletion request with an optional reason.
 * 3. Retrieve the detail by userId and request id.
 * 4. Validate the record belongs to the caller and matches created data.
 */
export async function test_api_account_deletion_request_detail_own_success(
  connection: api.IConnection,
) {
  // 1) Join as todoUser (register + authenticated context)
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string & tags.MinLength<8> & tags.MaxLength<64> =
    typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>();

  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: {
      email,
      password,
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authorized);

  const userId = authorized.id; // string & tags.Format<"uuid">

  // 2) Create an account deletion request
  const reason = RandomGenerator.paragraph({ sentences: 4 });
  const created =
    await api.functional.todoApp.todoUser.users.accountDeletionRequests.create(
      connection,
      {
        userId,
        body: {
          reason,
        } satisfies ITodoAppAccountDeletionRequest.ICreate,
      },
    );
  typia.assert(created);

  // 3) Retrieve the request detail
  const detail =
    await api.functional.todoApp.todoUser.users.accountDeletionRequests.at(
      connection,
      {
        userId,
        accountDeletionRequestId: created.id,
      },
    );
  typia.assert(detail);

  // 4) Business validations
  TestValidator.equals("detail id matches created id", detail.id, created.id);
  TestValidator.equals(
    "detail belongs to the caller",
    detail.todo_app_user_id,
    userId,
  );
  TestValidator.equals("reason is preserved on read", detail.reason, reason);
}
