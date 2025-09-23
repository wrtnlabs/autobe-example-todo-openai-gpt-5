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

export async function test_api_admin_action_search_unauthorized_role_forbidden(
  connection: api.IConnection,
) {
  /**
   * Validate that non-admin users (todoUser role) and unauthenticated callers
   * cannot access the administrative actions listing endpoint.
   *
   * Steps:
   *
   * 1. Register a new todoUser (join) to obtain a non-admin authenticated context.
   * 2. Attempt to call PATCH /todoApp/systemAdmin/adminActions with minimal valid
   *    pagination (page=1, limit=1) and expect an authorization failure.
   * 3. Create an unauthenticated connection and attempt the same call, expecting
   *    failure as well.
   */

  // 1) Register a non-admin user (todoUser)
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: typia.random<ITodoAppTodoUser.ICreate>(),
  });
  typia.assert(authorized);

  // Prepare minimal valid pagination request for admin action search
  const minimalRequest = {
    page: 1,
    limit: 1,
  } satisfies ITodoAppAdminAction.IRequest;

  // 2) Non-admin user should be forbidden/unauthorized to list admin actions
  await TestValidator.error(
    "non-admin todoUser cannot access system admin actions listing",
    async () => {
      await api.functional.todoApp.systemAdmin.adminActions.index(connection, {
        body: minimalRequest,
      });
    },
  );

  // 3) Unauthenticated connection must also be denied
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated caller cannot access system admin actions listing",
    async () => {
      await api.functional.todoApp.systemAdmin.adminActions.index(unauthConn, {
        body: minimalRequest,
      });
    },
  );
}
