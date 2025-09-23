import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppAccountStatusChange } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAccountStatusChange";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Verify admin-only access control for account status change detail endpoint.
 *
 * Business goal: Ensure that only systemAdmin can retrieve a single account
 * status change detail. Unauthenticated users and authenticated non-admin
 * todoUser accounts must be denied without leaking existence information.
 *
 * Steps:
 *
 * 1. Register a non-admin todoUser via /auth/todoUser/join (token is set by SDK).
 * 2. Attempt to GET /todoApp/systemAdmin/accountStatusChanges/{id} without any
 *    Authorization header using a separate unauthenticated connection – expect
 *    error.
 * 3. Attempt the same GET with the authenticated non-admin todoUser token – expect
 *    error.
 *
 * Notes:
 *
 * - Do not validate specific HTTP status codes; only assert that an error occurs.
 * - Use strict DTO typings for request bodies and path params.
 */
export async function test_api_account_status_change_detail_forbidden_for_non_admin(
  connection: api.IConnection,
) {
  // 1) Register a non-admin todoUser and obtain token (SDK sets Authorization)
  const registerBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: registerBody });
  typia.assert(authorized);

  // 2) Unauthenticated access must fail
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated access is denied for account status change detail",
    async () => {
      await api.functional.todoApp.systemAdmin.accountStatusChanges.at(
        unauthConn,
        {
          accountStatusChangeId: typia.random<string & tags.Format<"uuid">>(),
        },
      );
    },
  );

  // 3) Authenticated non-admin must be forbidden
  await TestValidator.error(
    "non-admin authenticated user is forbidden to read account status change detail",
    async () => {
      await api.functional.todoApp.systemAdmin.accountStatusChanges.at(
        connection,
        {
          accountStatusChangeId: typia.random<string & tags.Format<"uuid">>(),
        },
      );
    },
  );
}
