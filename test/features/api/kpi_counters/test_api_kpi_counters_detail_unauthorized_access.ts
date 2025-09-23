import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppKpiCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppKpiCounter";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Ensure KPI counter detail endpoint rejects unauthorized and non-admin access.
 *
 * Steps:
 *
 * 1. Unauthenticated request using a connection with empty headers must fail.
 * 2. Authenticated non-admin (todoUser) using token obtained from join must fail.
 *
 * Notes:
 *
 * - Do not validate specific HTTP status codes; only that an error occurs.
 * - Never manipulate headers directly beyond creating an unauthenticated copy.
 */
export async function test_api_kpi_counters_detail_unauthorized_access(
  connection: api.IConnection,
) {
  // Prepare a placeholder KPI counter id (uuid)
  const kpiCounterId = typia.random<string & tags.Format<"uuid">>();

  // 1) Unauthenticated call: create a connection without headers
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "reject KPI detail without Authorization header",
    async () => {
      await api.functional.todoApp.systemAdmin.kpiCounters.at(unauthConn, {
        kpiCounterId,
      });
    },
  );

  // 2) Non-admin token: register a todoUser and use that connection
  const userConn: api.IConnection = { ...connection, headers: {} };
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;

  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(userConn, { body: joinBody });
  typia.assert(authorized);

  await TestValidator.error(
    "reject KPI detail with non-admin (todoUser) token",
    async () => {
      await api.functional.todoApp.systemAdmin.kpiCounters.at(userConn, {
        kpiCounterId,
      });
    },
  );
}
