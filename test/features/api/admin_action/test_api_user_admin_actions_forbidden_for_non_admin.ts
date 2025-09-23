import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppAdminAction } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppAdminAction";
import type { ITodoAppAdminAction } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAdminAction";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_user_admin_actions_forbidden_for_non_admin(
  connection: api.IConnection,
) {
  /**
   * Verify that a non-admin todoUser cannot access the admin-only
   * administrative actions endpoint for a user.
   *
   * Steps:
   *
   * 1. Register a todoUser (join) to obtain an authenticated session
   * 2. Attempt the admin-only search endpoint using that todoUser
   * 3. Assert that an error occurs (authorization failure)
   */
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;

  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // As a regular todoUser, calling the admin-only endpoint must fail.
  await TestValidator.error(
    "non-admin user cannot access admin-only adminActions",
    async () => {
      await api.functional.todoApp.systemAdmin.users.adminActions.index(
        connection,
        {
          userId: authorized.id,
          body: {} satisfies ITodoAppAdminAction.IRequest,
        },
      );
    },
  );
}
