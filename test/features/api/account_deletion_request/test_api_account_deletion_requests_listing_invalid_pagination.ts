import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppAccountDeletionRequest } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppAccountDeletionRequest";
import type { ITodoAppAccountDeletionRequest } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAccountDeletionRequest";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * List account deletion requests with boundary pagination and permission
 * checks.
 *
 * This test verifies two core behaviors without relying on type-level
 * validation errors:
 *
 * 1. Happy path listing with valid pagination bounds (limit=1), ensuring the API
 *    returns a well-typed page and does not exceed the requested page size.
 * 2. Ownership/authorization enforcement by attempting to list another user's
 *    account deletion requests from a different authenticated session, which
 *    must be rejected by the backend.
 *
 * Steps
 *
 * 1. Join as todoUser A (receive id and token via ITodoAppTodoUser.IAuthorized).
 * 2. Create one account deletion request for user A.
 * 3. List user A's deletion requests with page=1, limit=1 and validate page-size
 *    behavior.
 * 4. Join as a different todoUser B (token switches automatically).
 * 5. Attempt to list user A's deletion requests with user B's token and expect a
 *    runtime error (permission denied / ownership enforcement).
 */
export async function test_api_account_deletion_requests_listing_invalid_pagination(
  connection: api.IConnection,
) {
  // 1) Join as todoUser A
  const userABody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const authA = await api.functional.auth.todoUser.join(connection, {
    body: userABody,
  });
  typia.assert(authA);

  // 2) Create an account deletion request for user A
  const createBody = {
    reason: RandomGenerator.paragraph({ sentences: 6 }),
  } satisfies ITodoAppAccountDeletionRequest.ICreate;
  const created =
    await api.functional.todoApp.todoUser.users.accountDeletionRequests.create(
      connection,
      {
        userId: authA.id,
        body: createBody,
      },
    );
  typia.assert(created);
  TestValidator.equals(
    "created request is owned by authenticated user",
    created.todo_app_user_id,
    authA.id,
  );

  // 3) List user A's requests with valid boundary pagination (limit=1)
  const listBodyA = {
    page: 1,
    limit: 1,
    order_by: "created_at",
    order_dir: "desc",
  } satisfies ITodoAppAccountDeletionRequest.IRequest;
  const pageA =
    await api.functional.todoApp.todoUser.users.accountDeletionRequests.index(
      connection,
      {
        userId: authA.id,
        body: listBodyA,
      },
    );
  typia.assert(pageA);
  TestValidator.predicate(
    "list respects page size (<= 1)",
    pageA.data.length <= 1,
  );

  // 4) Join as a different user B (this will switch the Authorization token)
  const userBBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const authB = await api.functional.auth.todoUser.join(connection, {
    body: userBBody,
  });
  typia.assert(authB);

  // 5) Attempt to list user A's requests while authenticated as user B
  await TestValidator.error(
    "cross-user access is forbidden when listing deletion requests",
    async () => {
      await api.functional.todoApp.todoUser.users.accountDeletionRequests.index(
        connection,
        {
          userId: authA.id,
          body: {
            page: 1,
            limit: 10,
          } satisfies ITodoAppAccountDeletionRequest.IRequest,
        },
      );
    },
  );
}
