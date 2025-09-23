import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppAccountDeletionRequest } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAccountDeletionRequest";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Validate not-found behavior for fetching a user's account deletion request
 * with a non-existent ID.
 *
 * Scenario rewrite rationale: Although the original scenario aimed to validate
 * invalid UUID format on path parameters, DTOs enforce `string &
 * tags.Format<"uuid">` at compile time, and E2E tests must not bypass type
 * safety. Therefore, this test uses a valid UUID that should not exist and
 * asserts that the endpoint rejects the request (not-found) for the
 * authenticated user.
 *
 * Steps:
 *
 * 1. Register (join) as a todoUser to obtain authorized context and userId.
 * 2. Attempt to fetch an account deletion request using a random valid UUID that
 *    is presumed non-existent for this user.
 * 3. Assert that the call fails (business error path), without checking status
 *    codes.
 */
export async function test_api_account_deletion_request_detail_invalid_id_format(
  connection: api.IConnection,
) {
  // 1) Authenticate (join) as todoUser
  const auth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: typia.random<ITodoAppTodoUser.ICreate>(),
    });
  typia.assert(auth);

  // 2) Prepare path parameters with proper UUID formats
  const userId: string & tags.Format<"uuid"> = auth.id; // owner user id
  const accountDeletionRequestId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >(); // presumed non-existent

  // 3) Expect not-found style error (do not validate status codes)
  await TestValidator.error(
    "non-existent accountDeletionRequestId should result in error",
    async () => {
      await api.functional.todoApp.todoUser.users.accountDeletionRequests.at(
        connection,
        {
          userId,
          accountDeletionRequestId,
        },
      );
    },
  );
}
