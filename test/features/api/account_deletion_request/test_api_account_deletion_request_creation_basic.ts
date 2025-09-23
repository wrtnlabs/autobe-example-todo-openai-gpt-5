import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppAccountDeletionRequest } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAccountDeletionRequest";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Basic creation of a user's account deletion request.
 *
 * Business context:
 *
 * - A logged-in todoUser initiates an account deletion workflow. The server
 *   should associate the new request to the authenticated subject, initialize
 *   its status per policy, and stamp lifecycle timestamps.
 *
 * Steps:
 *
 * 1. Join as a todoUser to obtain authenticated context and userId.
 * 2. Create an account deletion request for the same userId with an optional
 *    reason.
 * 3. Validate ownership mapping (todo_app_user_id), non-empty status, and logical
 *    timestamps.
 */
export async function test_api_account_deletion_request_creation_basic(
  connection: api.IConnection,
) {
  // 1) Register/join as todoUser (authentication handled by SDK)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;

  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBody });
  typia.assert(authorized);

  // 2) Create deletion request for own user
  const reason = RandomGenerator.paragraph({ sentences: 8 });
  const created: ITodoAppAccountDeletionRequest =
    await api.functional.todoApp.todoUser.users.accountDeletionRequests.create(
      connection,
      {
        userId: authorized.id,
        body: { reason } satisfies ITodoAppAccountDeletionRequest.ICreate,
      },
    );
  typia.assert(created);

  // 3) Business logic validations (avoid redundant type checks after typia.assert)
  TestValidator.equals(
    "owner id in created deletion request must match authenticated user id",
    created.todo_app_user_id,
    authorized.id,
  );

  TestValidator.predicate(
    "status should be initialized as a non-empty string",
    created.status.length > 0,
  );

  const createdAtMs = Date.parse(created.created_at);
  const updatedAtMs = Date.parse(created.updated_at);
  TestValidator.predicate(
    "timestamps should be logical: updated_at >= created_at",
    updatedAtMs >= createdAtMs,
  );

  TestValidator.predicate(
    "reason is either persisted as provided or nullish per policy",
    created.reason === reason ||
      created.reason === null ||
      created.reason === undefined,
  );
}
