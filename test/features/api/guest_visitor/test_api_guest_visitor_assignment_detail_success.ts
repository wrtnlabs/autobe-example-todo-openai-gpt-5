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
 * Validate that a systemAdmin can retrieve details of a guestVisitor role
 * assignment for a specific user.
 *
 * Business workflow:
 *
 * 1. Create a guestVisitor account to ensure an assignment exists; capture the new
 *    user's id.
 * 2. Create (join) a systemAdmin account to obtain admin auth (SDK handles token
 *    switching).
 * 3. List the guestVisitor assignments for the created user via admin endpoint to
 *    obtain a guestVisitorId.
 * 4. Fetch the detailed record using the GET endpoint with path params (userId,
 *    guestVisitorId).
 * 5. Validate identity correlation between list summary and detail record as well
 *    as ownership.
 */
export async function test_api_guest_visitor_assignment_detail_success(
  connection: api.IConnection,
) {
  // 1) Create a guestVisitor account (capture userId)
  const guestJoin = await api.functional.auth.guestVisitor.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
    } satisfies ITodoAppGuestVisitor.IJoin,
  });
  typia.assert(guestJoin);
  const userId = guestJoin.id; // owner user id to scope subsequent admin API calls

  // 2) Create (join) a system admin account (token switches to admin)
  const adminJoin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(adminJoin);

  // 3) List guestVisitor assignments for the created user to obtain an assignment id
  const page =
    await api.functional.todoApp.systemAdmin.users.guestVisitors.index(
      connection,
      {
        userId,
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

  // Expect at least one assignment for the newly created (active) guest account
  TestValidator.predicate(
    "guestVisitor list should contain at least one assignment",
    page.data.length >= 1,
  );

  // All returned summaries should belong to the same user
  TestValidator.predicate(
    "every summary.todo_app_user_id equals the requested userId",
    page.data.every((s) => s.todo_app_user_id === userId),
  );

  const summary = page.data[0];

  // When active_only is true, each summary should be active (revoked_at null/undefined)
  TestValidator.predicate(
    "selected summary is active (revoked_at null or undefined)",
    summary.revoked_at === null || summary.revoked_at === undefined,
  );

  // 4) Fetch detail by (userId, guestVisitorId)
  const detail =
    await api.functional.todoApp.systemAdmin.users.guestVisitors.at(
      connection,
      {
        userId,
        guestVisitorId: summary.id,
      },
    );
  typia.assert(detail);

  // 5) Validate identity correlation and ownership
  TestValidator.equals(
    "detail.id equals selected summary.id",
    detail.id,
    summary.id,
  );
  TestValidator.equals(
    "detail.todo_app_user_id equals path userId",
    detail.todo_app_user_id,
    userId,
  );
  TestValidator.equals(
    "detail.todo_app_user_id equals summary.todo_app_user_id",
    detail.todo_app_user_id,
    summary.todo_app_user_id,
  );
  TestValidator.equals(
    "detail.granted_at equals summary.granted_at",
    detail.granted_at,
    summary.granted_at,
  );
  TestValidator.equals(
    "detail.revoked_at equals summary.revoked_at",
    detail.revoked_at ?? null,
    summary.revoked_at ?? null,
  );
}
