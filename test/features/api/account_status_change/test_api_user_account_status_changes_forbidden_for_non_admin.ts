import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppAccountStatusChange } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppAccountStatusChange";
import type { ITodoAppAccountStatusChange } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAccountStatusChange";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Verify that non-admin users cannot access administrative account status
 * change histories.
 *
 * Steps:
 *
 * 1. Join as a todoUser (non-admin) using /auth/todoUser/join.
 * 2. Attempt to search account status changes via PATCH
 *    /todoApp/systemAdmin/users/{userId}/accountStatusChanges for (a) own
 *    userId and (b) a random other userId.
 * 3. Assert that both attempts are rejected (error thrown) without asserting
 *    specific HTTP status codes and without inspecting error messages,
 *    preventing information leakage.
 */
export async function test_api_user_account_status_changes_forbidden_for_non_admin(
  connection: api.IConnection,
) {
  // 1) Join as a todoUser (non-admin)
  const joinBody = typia.random<ITodoAppTodoUser.ICreate>();
  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // 2-a) Attempt admin endpoint for own userId → must be rejected
  const ownRequestBody = {
    page: 1,
    limit: 10,
    orderBy: "created_at",
    orderDirection: "desc",
    target_user_id: authorized.id,
  } satisfies ITodoAppAccountStatusChange.IRequest;

  await TestValidator.error(
    "non-admin cannot access their own account status changes via admin endpoint",
    async () => {
      await api.functional.todoApp.systemAdmin.users.accountStatusChanges.index(
        connection,
        {
          userId: authorized.id,
          body: ownRequestBody,
        },
      );
    },
  );

  // 2-b) Attempt admin endpoint for another random userId → must be rejected
  const otherUserId = typia.random<string & tags.Format<"uuid">>();
  const otherRequestBody = {
    page: 1,
    limit: 10,
    orderBy: "created_at",
    orderDirection: "desc",
    target_user_id: otherUserId,
  } satisfies ITodoAppAccountStatusChange.IRequest;

  await TestValidator.error(
    "non-admin cannot access other user's account status changes via admin endpoint",
    async () => {
      await api.functional.todoApp.systemAdmin.users.accountStatusChanges.index(
        connection,
        {
          userId: otherUserId,
          body: otherRequestBody,
        },
      );
    },
  );
}
