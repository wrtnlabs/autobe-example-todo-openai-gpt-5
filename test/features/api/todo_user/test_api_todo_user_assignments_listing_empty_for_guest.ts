import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppTodoUser";
import type { ITodoAppGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppGuestVisitor";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_todo_user_assignments_listing_empty_for_guest(
  connection: api.IConnection,
) {
  /**
   * Validate admin-only listing returns empty for a guest-only user.
   *
   * Steps:
   *
   * 1. Create a guestVisitor (captures userId). While guest is authenticated,
   *    verify the admin-only list call is forbidden (error expected).
   * 2. Join as systemAdmin to switch token to admin.
   * 3. List the guest user's todoUser assignment history.
   * 4. Expect empty result: data.length === 0 and pagination.records === 0.
   */

  // 1) Create guestVisitor account and capture its id (this authenticates as guest)
  const guest: ITodoAppGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
      } satisfies ITodoAppGuestVisitor.IJoin,
    });
  typia.assert(guest);

  // Permission boundary: guest must not be able to call admin-only listing
  await TestValidator.error(
    "guestVisitor cannot access systemAdmin users.todoUsers.index",
    async () => {
      await api.functional.todoApp.systemAdmin.users.todoUsers.index(
        connection,
        {
          userId: guest.id,
          body: {
            page: 1,
            limit: 20,
            sort: "granted_at",
            direction: "desc",
            activeOnly: false,
          } satisfies ITodoAppTodoUser.IRequest,
        },
      );
    },
  );

  // 2) Join as systemAdmin (authenticate as admin for the admin-only list call)
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: "P@ssw0rd1",
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(admin);

  // 3) List the guest user's todoUser role history as admin
  const page = await api.functional.todoApp.systemAdmin.users.todoUsers.index(
    connection,
    {
      userId: guest.id,
      body: {
        page: 1,
        limit: 20,
        sort: "granted_at",
        direction: "desc",
        activeOnly: false,
      } satisfies ITodoAppTodoUser.IRequest,
    },
  );
  typia.assert(page);

  // 4) Validate empty listing and non-negative pagination numbers
  TestValidator.equals(
    "todoUser history should be empty for newly created guest",
    page.data.length,
    0,
  );
  TestValidator.equals(
    "records should be zero when no history exists",
    page.pagination.records,
    0,
  );
  TestValidator.predicate(
    "pagination fields are non-negative",
    page.pagination.current >= 0 &&
      page.pagination.limit >= 0 &&
      page.pagination.pages >= 0 &&
      page.pagination.records >= 0,
  );
}
