import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppTodoUser";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * List active todoUser role assignments for a specific user (admin-only).
 *
 * Purpose:
 *
 * - Ensure a system administrator can list role assignment history for a user who
 *   currently holds the todoUser role.
 * - Validate active-only filtering, sorting, and pagination behaviors.
 *
 * Workflow:
 *
 * 1. Join as systemAdmin to authenticate administrative access on the main
 *    connection.
 * 2. Create a new todoUser using an isolated connection so the admin token on the
 *    main connection is preserved.
 * 3. As the systemAdmin (main connection), list the user's todoUser assignments
 *    with activeOnly=true and verify results.
 *
 * Validations:
 *
 * - Response types are asserted with typia.assert().
 * - There is at least one active assignment (revoked_at is null) for the user.
 * - All records belong to the targeted user (todo_app_user_id === userId).
 * - Results are sorted by granted_at in descending order.
 * - Pagination size does not exceed the requested limit and index is logical.
 */
export async function test_api_todo_user_assignments_listing_active(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin on the main connection
  const adminEmail = typia.random<string & tags.Format<"email">>();
  const adminPassword = typia.random<
    string & tags.MinLength<8> & tags.MaxLength<64>
  >();

  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: adminEmail,
        password: adminPassword,
        // Optional client context values can be omitted or provided as needed
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(adminAuth);

  // 2) Create a todoUser on an isolated connection to preserve admin token
  const isolatedConn: api.IConnection = { ...connection, headers: {} };
  const userEmail = typia.random<string & tags.Format<"email">>();
  const userPassword = typia.random<
    string & tags.MinLength<8> & tags.MaxLength<64>
  >();

  const userAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(isolatedConn, {
      body: {
        email: userEmail,
        password: userPassword,
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(userAuth);

  // 3) As systemAdmin, list the user's todoUser role assignments (active only)
  const requestBody = {
    page: 1,
    limit: 20,
    sort: "granted_at",
    direction: "desc",
    activeOnly: true,
  } satisfies ITodoAppTodoUser.IRequest;

  const page: IPageITodoAppTodoUser.ISummary =
    await api.functional.todoApp.systemAdmin.users.todoUsers.index(connection, {
      userId: userAuth.id,
      body: requestBody,
    });
  typia.assert(page);

  // Business validations
  TestValidator.predicate(
    "at least one active assignment exists",
    page.data.length >= 1,
  );

  TestValidator.predicate(
    "all records belong to the requested user",
    page.data.every((r) => r.todo_app_user_id === userAuth.id),
  );

  TestValidator.predicate(
    "all records are active (revoked_at is null or undefined)",
    page.data.every((r) => r.revoked_at === null || r.revoked_at === undefined),
  );

  const grantedTimes: number[] = page.data.map((r) => Date.parse(r.granted_at));
  const sortedDesc: boolean = grantedTimes.every((t, i, arr) =>
    i === 0 ? true : arr[i - 1] >= t,
  );
  TestValidator.predicate(
    "results are sorted by granted_at in descending order",
    sortedDesc,
  );

  TestValidator.predicate(
    "page size does not exceed the requested limit",
    page.data.length <= page.pagination.limit,
  );

  TestValidator.predicate(
    "pagination current index is non-negative",
    page.pagination.current >= 0,
  );
}
