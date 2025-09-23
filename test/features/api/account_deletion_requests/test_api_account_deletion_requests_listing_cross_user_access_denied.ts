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
 * Ensure cross-user listing of account deletion requests is denied.
 *
 * Business goal:
 *
 * - Only the owner (todoUser) may list their own account deletion requests.
 * - Attempts to list another user's requests must be rejected without exposing
 *   whether such records exist.
 *
 * Workflow:
 *
 * 1. Create two users (userA and userB) with separate IConnection instances so
 *    that their auth tokens are isolated per connection by the SDK.
 * 2. Under userB, create a deletion request.
 * 3. As userB (owner), list their own deletion requests and ensure the created
 *    request appears (sanity/positive control).
 * 4. As userA, attempt to list userB's deletion requests and assert the call fails
 *    (authorization enforcement). No status code assertions.
 */
export async function test_api_account_deletion_requests_listing_cross_user_access_denied(
  connection: api.IConnection,
) {
  // Prepare two isolated connections so that each join call binds its token
  // independently without manual header manipulation.
  const connA: api.IConnection = {
    ...connection,
    headers: { ...(connection.headers ?? {}) },
  };
  const connB: api.IConnection = {
    ...connection,
    headers: { ...(connection.headers ?? {}) },
  };

  // 1) userA joins
  const userAEmail = typia.random<string & tags.Format<"email">>();
  const userAPassword = typia.random<
    string & tags.MinLength<8> & tags.MaxLength<64>
  >();
  const authA = await api.functional.auth.todoUser.join(connA, {
    body: {
      email: userAEmail,
      password: userAPassword,
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authA);

  // 2) userB joins
  const userBEmail = typia.random<string & tags.Format<"email">>();
  const userBPassword = typia.random<
    string & tags.MinLength<8> & tags.MaxLength<64>
  >();
  const authB = await api.functional.auth.todoUser.join(connB, {
    body: {
      email: userBEmail,
      password: userBPassword,
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authB);

  // 3) Under userB, create an account deletion request
  const created =
    await api.functional.todoApp.todoUser.users.accountDeletionRequests.create(
      connB,
      {
        userId: authB.id,
        body: {
          reason: RandomGenerator.paragraph({ sentences: 5 }),
        } satisfies ITodoAppAccountDeletionRequest.ICreate,
      },
    );
  typia.assert(created);

  // 4) Positive control: owner (userB) can list their own requests and should
  //    see the created one in the results.
  const pageB =
    await api.functional.todoApp.todoUser.users.accountDeletionRequests.index(
      connB,
      {
        userId: authB.id,
        body: {
          page: 1,
          limit: 10,
        } satisfies ITodoAppAccountDeletionRequest.IRequest,
      },
    );
  typia.assert(pageB);
  const ownerHasCreated =
    pageB.data.find((s) => s.id === created.id) !== undefined;
  TestValidator.predicate(
    "owner listing should include the created deletion request",
    ownerHasCreated,
  );

  // 5) Cross-user denial: userA attempts to list userB's requests → must fail.
  await TestValidator.error(
    "cross-user listing must be denied by access control",
    async () => {
      await api.functional.todoApp.todoUser.users.accountDeletionRequests.index(
        connA,
        {
          userId: authB.id,
          body: {
            page: 1,
            limit: 10,
          } satisfies ITodoAppAccountDeletionRequest.IRequest,
        },
      );
    },
  );
}
