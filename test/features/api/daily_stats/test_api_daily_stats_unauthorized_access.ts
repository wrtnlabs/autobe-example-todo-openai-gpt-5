import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppDailyStat } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppDailyStat";
import type { ITodoAppDailyStat } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppDailyStat";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Verify that daily statistics search is protected from unauthorized access.
 *
 * Business goal
 *
 * - Ensure only systemAdmin role can access the administrative analytics surface
 *   at /todoApp/systemAdmin/dailyStats.
 *
 * What this test validates
 *
 * 1. Unauthenticated access is rejected (no Authorization header).
 * 2. Authenticated non-admin (todoUser) access is rejected.
 *
 * Steps
 *
 * 1. Build a valid ITodoAppDailyStat.IRequest payload (so errors stem from auth).
 * 2. Create an unauthenticated connection (headers: {}) and call PATCH
 *    /todoApp/systemAdmin/dailyStats expecting an error.
 * 3. Join as a todoUser (non-admin), assert authorization response, then call the
 *    admin endpoint again and expect an error.
 */
export async function test_api_daily_stats_unauthorized_access(
  connection: api.IConnection,
) {
  // 1) Prepare a valid search payload (kept simple and within constraints)
  const today = new Date();
  const from = new Date(
    today.getTime() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const to = today.toISOString();
  const searchBody = {
    page: 1,
    limit: 10,
    stats_date_from: from,
    stats_date_to: to,
    sort: "stats_date desc",
  } satisfies ITodoAppDailyStat.IRequest;

  // 2) Unauthenticated call: clone connection with empty headers ONLY
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "missing Authorization must be rejected for admin daily stats",
    async () => {
      await api.functional.todoApp.systemAdmin.dailyStats.index(unauthConn, {
        body: searchBody,
      });
    },
  );

  // 3) Join as a regular todoUser (non-admin)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const member: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBody });
  typia.assert(member);

  // With a non-admin token on the same connection, the admin endpoint must error
  await TestValidator.error(
    "non-admin token must be forbidden from admin analytics",
    async () => {
      await api.functional.todoApp.systemAdmin.dailyStats.index(connection, {
        body: searchBody,
      });
    },
  );
}
