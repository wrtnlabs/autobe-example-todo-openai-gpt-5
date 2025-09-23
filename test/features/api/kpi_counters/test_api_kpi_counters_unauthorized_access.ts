import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { EOrderByITodoAppKpiCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/EOrderByITodoAppKpiCounter";
import type { EOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/EOrderDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppKpiCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppKpiCounter";
import type { ITodoAppKpiCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppKpiCounter";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Verify admin-only access control for KPI counters search.
 *
 * Business context:
 *
 * - KPI analytics are restricted to system administrators. Regular users must not
 *   be able to query KPI windows. Also, anonymous callers must be blocked.
 *
 * What this test validates:
 *
 * 1. Unauthenticated request to PATCH /todoApp/systemAdmin/kpiCounters is denied.
 * 2. Authenticated non-admin (todoUser) request is denied.
 *
 * Notes:
 *
 * - We do not validate specific HTTP status codes or error payloads; only that an
 *   error occurs (business rule: access denied).
 * - We do not attempt a successful admin call because no admin-auth API is
 *   provided in the materials.
 */
export async function test_api_kpi_counters_unauthorized_access(
  connection: api.IConnection,
) {
  // 1) Prepare a valid KPI search request body
  const searchBodyUnauth = {
    page: 1,
    limit: 10,
    order_by: "window_end",
    order_dir: "desc",
  } satisfies ITodoAppKpiCounter.IRequest;

  // 2) Create an unauthenticated connection clone (do not manipulate headers afterwards)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 3) Unauthenticated request must be denied
  await TestValidator.error(
    "unauthenticated access to KPI counters is denied",
    async () => {
      await api.functional.todoApp.systemAdmin.kpiCounters.index(unauthConn, {
        body: searchBodyUnauth,
      });
    },
  );

  // 4) Register a non-admin todoUser (join issues token and SDK auto-injects Authorization)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);

  // 5) Authenticated non-admin request must be denied
  const searchBodyUser = {
    page: 1,
    limit: 10,
    order_by: "window_end",
    order_dir: "desc",
  } satisfies ITodoAppKpiCounter.IRequest;
  await TestValidator.error(
    "non-admin (todoUser) access to KPI counters is denied",
    async () => {
      await api.functional.todoApp.systemAdmin.kpiCounters.index(connection, {
        body: searchBodyUser,
      });
    },
  );
}
