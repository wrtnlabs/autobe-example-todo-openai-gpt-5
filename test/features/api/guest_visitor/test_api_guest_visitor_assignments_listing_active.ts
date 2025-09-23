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

/**
 * List active guestVisitor assignments for a specific user as systemAdmin.
 *
 * Business context:
 *
 * - A guestVisitor join creates a user identity and (by governance model) a role
 *   grant record that should appear as an active assignment (revoked_at is null
 *   while active).
 * - Only systemAdmin may list role assignments for any user.
 *
 * Steps:
 *
 * 1. Create a guestVisitor to get target userId.
 * 2. Create a systemAdmin to obtain admin authorization (SDK sets token).
 * 3. Call the admin listing with active_only=true, page/limit, and sorting.
 * 4. Validate: type, at least one active record, ownership scoping, sorting,
 *    pagination invariants, and limit application.
 * 5. Negative case: unauthenticated call must be rejected.
 */
export async function test_api_guest_visitor_assignments_listing_active(
  connection: api.IConnection,
) {
  // 1) Create a guestVisitor and capture the user id
  const guestJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
  } satisfies ITodoAppGuestVisitor.IJoin;
  const guestAuth: ITodoAppGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.join(connection, {
      body: guestJoinBody,
    });
  typia.assert(guestAuth);
  const targetUserId = guestAuth.id; // UUID of the new guest user

  // 2) Create a systemAdmin to obtain admin authorization (overwrites token)
  const adminEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const adminPassword = RandomGenerator.alphaNumeric(12); // 8~64 chars policy OK
  const adminJoinBody = {
    email: adminEmail,
    password: adminPassword,
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: adminJoinBody,
    });
  typia.assert(adminAuth);

  // 3) List active assignments for the target user, sorted by granted_at desc
  const pageNumber = 1;
  const limit = 10;
  const listBody = {
    active_only: true,
    page: pageNumber,
    limit,
    order_by: "granted_at",
    order_dir: "desc",
  } satisfies ITodoAppGuestVisitor.IRequest;
  const page: IPageITodoAppGuestVisitor.ISummary =
    await api.functional.todoApp.systemAdmin.users.guestVisitors.index(
      connection,
      {
        userId: targetUserId,
        body: listBody,
      },
    );
  typia.assert(page);

  // 4a) Expect at least one active record
  TestValidator.predicate(
    "at least one active guestVisitor assignment exists",
    page.data.length >= 1,
  );

  // 4b) Ownership enforcement: every record belongs to the requested user
  TestValidator.predicate(
    "every summary.todo_app_user_id equals target userId",
    page.data.every((r) => r.todo_app_user_id === targetUserId),
  );

  // 4c) Active-only: revoked_at must be null or undefined for all items
  TestValidator.predicate(
    "all records are active (revoked_at is null/undefined)",
    page.data.every((r) => r.revoked_at === null || r.revoked_at === undefined),
  );

  // 4d) Sorting check: granted_at desc (when multiple items exist)
  if (page.data.length > 1) {
    const isDesc = page.data
      .slice(1)
      .every(
        (r, i) =>
          new Date(page.data[i].granted_at).getTime() >=
          new Date(r.granted_at).getTime(),
      );
    TestValidator.predicate("sorted by granted_at desc", isDesc);
  }

  // 4e) Pagination invariants and applied limit
  TestValidator.equals(
    "pagination.limit equals requested limit",
    page.pagination.limit,
    limit,
  );
  TestValidator.predicate(
    "pagination.records >= current page size",
    page.pagination.records >= page.data.length,
  );
  TestValidator.predicate(
    "pagination.current is non-negative",
    page.pagination.current >= 0,
  );

  // 5) Negative case: unauthenticated access should error
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "list requires systemAdmin authorization (unauthenticated should fail)",
    async () => {
      await api.functional.todoApp.systemAdmin.users.guestVisitors.index(
        unauthConn,
        {
          userId: targetUserId,
          body: listBody,
        },
      );
    },
  );
}
