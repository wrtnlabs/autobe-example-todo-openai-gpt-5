import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppSystemAdmin";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Non-admin member must not be able to list another user's systemAdmin role
 * assignment history.
 *
 * Steps:
 *
 * 1. Register a system admin to obtain an admin user id (path parameter target).
 * 2. Register a regular todo user to switch the connection to a non-admin token.
 * 3. Attempt to list the admin’s systemAdmin role history using the member token,
 *    expecting an authorization failure (do not validate specific status
 *    codes).
 */
export async function test_api_system_admin_role_assignment_history_forbidden_for_member(
  connection: api.IConnection,
) {
  // 1) Create a system administrator and capture admin id
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: adminJoinBody,
    });
  typia.assert(adminAuth);
  const adminUserId = adminAuth.id; // path param

  // 2) Create a regular member (todoUser) - switches Authorization to member token
  const memberJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const memberAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: memberJoinBody,
    });
  typia.assert(memberAuth);

  // 3) Using member token, attempt forbidden listing against admin's role history
  const listRequest = {
    page: typia.random<number & tags.Type<"int32"> & tags.Minimum<1>>(),
    limit: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<1> & tags.Maximum<100>
    >(),
    activeOnly: true,
  } satisfies ITodoAppSystemAdmin.IRequest;

  // Assert only that an error occurs (no status code validation)
  await TestValidator.error(
    "member cannot list systemAdmin role history",
    async () => {
      await api.functional.todoApp.systemAdmin.users.systemAdmins.index(
        connection,
        {
          userId: adminUserId,
          body: listRequest,
        },
      );
    },
  );
}
