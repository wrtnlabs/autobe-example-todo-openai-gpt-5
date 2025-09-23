import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { EGuestVisitorOrderBy } from "@ORGANIZATION/PROJECT-api/lib/structures/EGuestVisitorOrderBy";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppGuestVisitor";
import type { ITodoAppGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppGuestVisitor";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_guest_visitor_assignments_listing_empty_for_todouser(
  connection: api.IConnection,
) {
  /**
   * Validate that guestVisitor assignment listing is empty for a freshly joined
   * todoUser.
   *
   * Steps:
   *
   * 1. Join as todoUser to obtain target userId (no guestVisitor grants should be
   *    created).
   * 2. Join as systemAdmin to ensure admin-privileged token on the connection.
   * 3. Call listing endpoint for the todoUser's guestVisitor assignments.
   * 4. Assert the page is empty (records === 0, data.length === 0).
   */

  // 1) Create a todoUser and capture id
  const todoUserAuthorized = await api.functional.auth.todoUser.join(
    connection,
    {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppTodoUser.ICreate,
    },
  );
  typia.assert(todoUserAuthorized);

  // 2) Authenticate as systemAdmin (admin-only endpoint below)
  const adminAuthorized = await api.functional.auth.systemAdmin.join(
    connection,
    {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    },
  );
  typia.assert(adminAuthorized);

  // 3) List guestVisitor assignments for the created todoUser
  const page =
    await api.functional.todoApp.systemAdmin.users.guestVisitors.index(
      connection,
      {
        userId: todoUserAuthorized.id,
        body: {
          page: 1,
          limit: 10,
          active_only: true,
          order_by: "granted_at",
          order_dir: "desc",
        } satisfies ITodoAppGuestVisitor.IRequest,
      },
    );
  typia.assert(page);

  // 4) Business validations: ensure empty result set
  TestValidator.equals(
    "no guestVisitor records exist for a fresh todoUser",
    page.pagination.records,
    0,
  );
  TestValidator.equals(
    "data array is empty for guestVisitor listing",
    page.data.length,
    0,
  );
  TestValidator.equals(
    "total pages should be zero when there are no records",
    page.pagination.pages,
    0,
  );
}
