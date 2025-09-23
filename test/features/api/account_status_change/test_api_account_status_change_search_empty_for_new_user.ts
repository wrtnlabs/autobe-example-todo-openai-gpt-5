import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppAccountStatusChange } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppAccountStatusChange";
import type { ITodoAppAccountStatusChange } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAccountStatusChange";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Verify admin-only account status change search returns an empty, correctly
 * paginated result for a newly created member with no transitions, and that a
 * non-admin token cannot access the endpoint.
 *
 * Steps:
 *
 * 1. Join as system admin (admin A) – connection becomes admin-authenticated.
 * 2. Join as todoUser (member U) – connection becomes user-authenticated.
 * 3. With user token, attempt the admin-only search and expect an error.
 * 4. Join as another system admin (admin B) to restore admin context.
 * 5. Perform the search filtered by U's id and validate empty, coherent
 *    pagination.
 */
export async function test_api_account_status_change_search_empty_for_new_user(
  connection: api.IConnection,
) {
  // 1) Join as system admin (admin A)
  const adminJoinBody1 = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const adminA: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: adminJoinBody1,
    });
  typia.assert(adminA);

  // 2) Join as todoUser (member U)
  const userJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const member: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: userJoinBody,
    });
  typia.assert(member);

  // 3) Negative authorization: non-admin cannot access admin-only endpoint
  await TestValidator.error(
    "non-admin token cannot list account status changes",
    async () => {
      await api.functional.todoApp.systemAdmin.accountStatusChanges.index(
        connection,
        {
          body: {
            page: 1,
            limit: 20,
            orderBy: "created_at",
            orderDirection: "desc",
            target_user_id: member.id,
          } satisfies ITodoAppAccountStatusChange.IRequest,
        },
      );
    },
  );

  // 4) Restore admin context by joining another system admin (admin B)
  const adminJoinBody2 = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const adminB: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: adminJoinBody2,
    });
  typia.assert(adminB);

  // 5) Positive path: admin search for the new user – expect empty result with proper pagination
  const page =
    await api.functional.todoApp.systemAdmin.accountStatusChanges.index(
      connection,
      {
        body: {
          page: 1,
          limit: 20,
          orderBy: "created_at",
          orderDirection: "desc",
          target_user_id: member.id,
        } satisfies ITodoAppAccountStatusChange.IRequest,
      },
    );
  typia.assert(page);

  // Validate pagination metadata and emptiness
  TestValidator.equals(
    "pagination current page echoes request",
    page.pagination.current,
    1,
  );
  TestValidator.equals(
    "pagination limit echoes request",
    page.pagination.limit,
    20,
  );
  TestValidator.equals(
    "no records for fresh account",
    page.pagination.records,
    0,
  );
  TestValidator.equals(
    "pages is zero when no records",
    page.pagination.pages,
    0,
  );
  TestValidator.equals("data array is empty", page.data.length, 0);

  // Defensive no-leak validation – if any items appear, they must belong to the target user
  TestValidator.predicate(
    "no leakage of unrelated users' data",
    page.data.every((r) => r.target_user_id === member.id),
  );
}
