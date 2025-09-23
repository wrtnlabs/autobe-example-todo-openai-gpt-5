import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppSystemAdmin";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * List self systemAdmin role assignment history right after joining.
 *
 * Purpose
 *
 * - Ensure a newly joined system administrator can query their own systemAdmin
 *   role assignment history.
 * - Validate that at least one active assignment exists (fresh grant) and that
 *   all listed records belong to the authenticated admin.
 *
 * Flow
 *
 * 1. Join as system administrator (returns { id, token })
 * 2. List role assignments for the joined admin with activeOnly=true
 * 3. Validate non-empty results, ownership scoping, presence of an active entry,
 *    and basic pagination sanity
 */
export async function test_api_system_admin_role_assignment_history_list_self_success(
  connection: api.IConnection,
) {
  // 1) Join as system administrator (auth handled by SDK)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const authorized: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, { body: joinBody });
  typia.assert(authorized);

  // 2) List role assignments for self (active entries preferred)
  const limit = 5;
  const request = {
    page: 1,
    limit,
    sort: "granted_at",
    direction: "desc",
    activeOnly: true,
  } satisfies ITodoAppSystemAdmin.IRequest;

  const page: IPageITodoAppSystemAdmin.ISummary =
    await api.functional.todoApp.systemAdmin.users.systemAdmins.index(
      connection,
      {
        userId: authorized.id,
        body: request,
      },
    );
  typia.assert(page);

  // 3) Business validations
  // 3-1) Non-empty list
  TestValidator.predicate(
    "role assignment history should not be empty",
    page.data.length > 0,
  );

  // 3-2) All records are scoped to the joined admin
  TestValidator.predicate(
    "all records belong to the authenticated admin",
    page.data.every((r) => r.todo_app_user_id === authorized.id),
  );

  // 3-3) At least one active assignment exists (revoked_at is null or omitted)
  TestValidator.predicate(
    "at least one active assignment exists",
    page.data.some((r) => r.revoked_at === null || r.revoked_at === undefined),
  );

  // 3-4) Pagination sanity (avoid equals on tagged numbers)
  TestValidator.predicate(
    "pagination current is non-negative",
    page.pagination.current >= 0,
  );
  TestValidator.predicate(
    "pagination limit reflects a positive constraint",
    page.pagination.limit >= 1,
  );
}
