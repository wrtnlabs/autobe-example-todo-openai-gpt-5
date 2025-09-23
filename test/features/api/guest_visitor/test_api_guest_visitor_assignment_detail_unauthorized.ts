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
 * Verify admin-only guestVisitor assignment detail rejects unauthorized
 * callers.
 *
 * Business goal:
 *
 * - Ensure that the detail endpoint for guestVisitor role assignment history only
 *   permits systemAdmin access.
 *
 * Steps:
 *
 * 1. Create a guest account (captures userId for scoping).
 * 2. Create a system admin account (switches SDK auth to admin).
 * 3. As admin, list guestVisitor assignments for the guest user and pick one id.
 * 4. Attempt GET detail without authentication — must fail.
 * 5. Switch to a non-admin (guest) and attempt GET detail — must fail.
 */
export async function test_api_guest_visitor_assignment_detail_unauthorized(
  connection: api.IConnection,
) {
  // 1) Create a guest account to get the userId for scoping
  const guestAuth: ITodoAppGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
      } satisfies ITodoAppGuestVisitor.IJoin,
    });
  typia.assert(guestAuth);
  const userId = guestAuth.id; // string & tags.Format<"uuid">

  // 2) Register a system admin so the SDK sets admin Authorization
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: typia.random<
          string & tags.MinLength<8> & tags.MaxLength<64>
        >(),
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(adminAuth);

  // 3) As admin, list guestVisitor assignments for the created guest user
  const page: IPageITodoAppGuestVisitor.ISummary =
    await api.functional.todoApp.systemAdmin.users.guestVisitors.index(
      connection,
      {
        userId,
        body: {
          page: 1 satisfies number as number, // int32 >= 1
          limit: 10 satisfies number as number, // int32 in [1,100]
        } satisfies ITodoAppGuestVisitor.IRequest,
      },
    );
  typia.assert(page);

  // Ensure there is at least one assignment to test against
  TestValidator.predicate(
    "guest user has at least one guestVisitor assignment",
    page.data.length > 0,
  );
  const guestVisitorId = page.data[0].id;

  // 4) Unauthenticated client attempt must fail
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated client is rejected for admin-only guestVisitor detail",
    async () => {
      await api.functional.todoApp.systemAdmin.users.guestVisitors.at(
        unauthConn,
        { userId, guestVisitorId },
      );
    },
  );

  // 5) Switch to a non-admin actor (guest) and try again — must fail
  const guestAuth2: ITodoAppGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
      } satisfies ITodoAppGuestVisitor.IJoin,
    });
  typia.assert(guestAuth2);

  await TestValidator.error(
    "non-admin (guest) is rejected for admin-only guestVisitor detail",
    async () => {
      await api.functional.todoApp.systemAdmin.users.guestVisitors.at(
        connection,
        { userId, guestVisitorId },
      );
    },
  );
}
