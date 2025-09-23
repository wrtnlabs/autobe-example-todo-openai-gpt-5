import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppDailyStat } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppDailyStat";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Ensure admin-only daily stat detail endpoint rejects unauthorized and
 * non-admin access.
 *
 * Business context:
 *
 * - /todoApp/systemAdmin/dailyStats/{dailyStatId} exposes sensitive analytics and
 *   must be restricted to systemAdmin role.
 *
 * Test flow:
 *
 * 1. Unauthenticated request:
 *
 *    - Create an unauthenticated connection copy (empty headers) and attempt GET
 *         detail with a random UUID.
 *    - Expect an error (authorization required) using TestValidator.error.
 * 2. Non-admin authenticated request:
 *
 *    - Register a todoUser via /auth/todoUser/join to get a non-admin token (SDK
 *         auto-sets Authorization on the provided connection).
 *    - Attempt the same GET detail with the same UUID on the now-authenticated
 *         (non-admin) connection.
 *    - Expect an error (forbidden) using TestValidator.error.
 */
export async function test_api_daily_stats_detail_unauthorized_access(
  connection: api.IConnection,
) {
  // Generate a target UUID for the detail endpoint
  const dailyStatId = typia.random<string & tags.Format<"uuid">>();

  // 1) Unauthenticated call should be rejected
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated access should be rejected for dailyStats detail",
    async () => {
      await api.functional.todoApp.systemAdmin.dailyStats.at(unauthConn, {
        dailyStatId,
      });
    },
  );

  // 2) Non-admin token: register a todoUser and ensure access is still rejected
  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: typia.random<
          string & tags.MinLength<8> & tags.MaxLength<64>
        >(),
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(authorized);

  await TestValidator.error(
    "non-admin (todoUser) must be forbidden for systemAdmin dailyStats detail",
    async () => {
      await api.functional.todoApp.systemAdmin.dailyStats.at(connection, {
        dailyStatId,
      });
    },
  );
}
