import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppAdminAction } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAdminAction";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_admin_action_detail_unauthorized_access_forbidden(
  connection: api.IConnection,
) {
  /**
   * Validate that a regular todoUser cannot access system admin action details.
   *
   * Steps:
   *
   * 1. Register a todoUser via join (issues token automatically via SDK).
   * 2. Attempt to GET an admin action detail with an arbitrary UUID while
   *    authenticated as todoUser.
   * 3. Expect an authorization error (forbidden/unauthorized). We assert only that
   *    an error occurs.
   */

  // 1) Register a regular member (todoUser) and obtain authorized session
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authorized);

  // 2) Prepare arbitrary admin action id (UUID)
  const arbitraryAdminActionId = typia.random<string & tags.Format<"uuid">>();

  // 3) Attempt to access admin-only endpoint with member token → must error
  await TestValidator.error(
    "non-admin member cannot fetch admin action detail",
    async () => {
      await api.functional.todoApp.systemAdmin.adminActions.at(connection, {
        adminActionId: arbitraryAdminActionId,
      });
    },
  );
}
