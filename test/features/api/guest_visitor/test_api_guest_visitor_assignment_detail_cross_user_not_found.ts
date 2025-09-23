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

export async function test_api_guest_visitor_assignment_detail_cross_user_not_found(
  connection: api.IConnection,
) {
  // Create Guest A (auth token becomes guest A)
  const guestAJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
  } satisfies ITodoAppGuestVisitor.IJoin;
  const guestA = await api.functional.auth.guestVisitor.join(connection, {
    body: guestAJoinBody,
  });
  typia.assert(guestA);

  // Create Guest B (auth token becomes guest B)
  const guestBJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
  } satisfies ITodoAppGuestVisitor.IJoin;
  const guestB = await api.functional.auth.guestVisitor.join(connection, {
    body: guestBJoinBody,
  });
  typia.assert(guestB);

  // Re-authenticate as systemAdmin for admin endpoints
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: adminJoinBody,
  });
  typia.assert(admin);

  // List B's guestVisitor assignments to obtain a valid guestVisitorId
  const listBody = {
    page: 1,
    limit: 10,
    active_only: true,
    order_by: "granted_at",
    order_dir: "desc",
  } satisfies ITodoAppGuestVisitor.IRequest;
  const pageB =
    await api.functional.todoApp.systemAdmin.users.guestVisitors.index(
      connection,
      {
        userId: guestB.id,
        body: listBody,
      },
    );
  typia.assert(pageB);
  TestValidator.predicate(
    "user B should have at least one guestVisitor assignment",
    pageB.data.length > 0,
  );

  const bAssignment = pageB.data[0];
  typia.assert<ITodoAppGuestVisitor.ISummary>(bAssignment);
  TestValidator.equals(
    "assignment owner must be user B",
    bAssignment.todo_app_user_id,
    guestB.id,
  );

  // Happy path: detail fetch with correct userId=B
  const detailB =
    await api.functional.todoApp.systemAdmin.users.guestVisitors.at(
      connection,
      {
        userId: guestB.id,
        guestVisitorId: bAssignment.id,
      },
    );
  typia.assert(detailB);
  TestValidator.equals(
    "detail id matches the listed assignment id",
    detailB.id,
    bAssignment.id,
  );

  // Cross-user scope: using userId=A with B's guestVisitorId must fail
  await TestValidator.error(
    "cross-user scoping should deny access to B's assignment when using userId=A",
    async () => {
      await api.functional.todoApp.systemAdmin.users.guestVisitors.at(
        connection,
        {
          userId: guestA.id,
          guestVisitorId: bAssignment.id,
        },
      );
    },
  );
}
