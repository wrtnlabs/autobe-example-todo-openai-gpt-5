import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppAdminAction } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppAdminAction";
import type { ITodoAppAdminAction } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAdminAction";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Search admin actions by admin and target when no actions exist (expect
 * empty).
 *
 * Business context:
 *
 * - A system administrator can query historical administrative actions.
 * - Immediately after creating both an admin and a target member, no action
 *   records should exist for that admin→target pair.
 *
 * Test steps:
 *
 * 1. Create a fresh todoUser (target) using a separate, unauthenticated connection
 *    so that the main connection's eventual admin session remains intact.
 * 2. Join as a systemAdmin on the main connection (SDK auto-injects token).
 * 3. Query PATCH /todoApp/systemAdmin/adminActions with filters:
 *
 *    - Admin_user_id = admin.id
 *    - Target_user_id = target.id
 *    - Page=1, limit=10, orderBy="created_at", orderDirection="desc"
 * 4. Validate: empty data array and coherent pagination (records=0, limits
 *    honored, non-negative indices).
 */
export async function test_api_admin_action_search_by_admin_and_target_with_empty_result(
  connection: api.IConnection,
) {
  // 1) Prepare a target todoUser on a separate unauthenticated connection
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  const todoUserBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const target = await api.functional.auth.todoUser.join(unauthConn, {
    body: todoUserBody,
  });
  typia.assert<ITodoAppTodoUser.IAuthorized>(target);

  // 2) Join as systemAdmin on the main connection
  const adminBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: adminBody,
  });
  typia.assert<ITodoAppSystemAdmin.IAuthorized>(admin);

  // 3) Query admin actions with strict filters and deterministic pagination
  const pageLimit = 10;
  const requestBody = {
    page: 1,
    limit: pageLimit,
    orderBy: "created_at",
    orderDirection: "desc",
    admin_user_id: admin.id,
    target_user_id: target.id,
  } satisfies ITodoAppAdminAction.IRequest;
  const page = await api.functional.todoApp.systemAdmin.adminActions.index(
    connection,
    { body: requestBody },
  );
  typia.assert<IPageITodoAppAdminAction.ISummary>(page);

  // 4) Business assertions
  TestValidator.equals(
    "admin action search returns empty data for new admin-target pair",
    page.data.length,
    0,
  );
  TestValidator.equals(
    "records should be zero for the new admin-target pair",
    page.pagination.records,
    0,
  );
  TestValidator.equals(
    "limit should match the requested page size",
    page.pagination.limit,
    pageLimit,
  );
  TestValidator.predicate(
    "current page index is non-negative",
    page.pagination.current >= 0,
  );
  TestValidator.predicate(
    "total pages is non-negative",
    page.pagination.pages >= 0,
  );
}
