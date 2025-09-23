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
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Ensure guestVisitor assignment listing rejects unauthorized access.
 *
 * Business context:
 *
 * - Listing guestVisitor role assignments is a governance/audit operation
 *   restricted to system administrators. Requests without admin authorization
 *   must be rejected.
 *
 * Steps:
 *
 * 1. Register a todoUser to obtain a real {userId} for path parameter usage.
 * 2. Create an unauthenticated connection clone (cleared headers) and call the
 *    listing endpoint → expect rejection.
 * 3. Call the listing endpoint again using a non-admin member token (todoUser)
 *    present on the original connection → expect rejection.
 */
export async function test_api_guest_visitor_assignments_listing_unauthorized(
  connection: api.IConnection,
) {
  // 1) Register a todoUser to get a valid userId for the path parameter
  const joinBody = {
    ...typia.random<ITodoAppTodoUser.ICreate>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const member = await api.functional.auth.todoUser.join(connection, {
    body: joinBody,
  });
  typia.assert(member);
  const userId = member.id; // string & tags.Format<"uuid">

  // 2) Build an unauthenticated connection clone (authorized header cleared)
  //    - This is the only allowed pattern for unauthenticated calls.
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // Request body for listing (randomized but type-safe)
  const listRequest1 = {
    ...typia.random<ITodoAppGuestVisitor.IRequest>(),
  } satisfies ITodoAppGuestVisitor.IRequest;

  // Unauthenticated access must be rejected
  await TestValidator.error(
    "unauthenticated access must be rejected",
    async () => {
      await api.functional.todoApp.systemAdmin.users.guestVisitors.index(
        unauthConn,
        {
          userId,
          body: listRequest1,
        },
      );
    },
  );

  // 3) Using a non-admin todoUser token (set by join), access must also be rejected
  const listRequest2 = {
    ...typia.random<ITodoAppGuestVisitor.IRequest>(),
  } satisfies ITodoAppGuestVisitor.IRequest;

  await TestValidator.error(
    "non-admin todoUser token must be rejected",
    async () => {
      await api.functional.todoApp.systemAdmin.users.guestVisitors.index(
        connection,
        {
          userId,
          body: listRequest2,
        },
      );
    },
  );
}
