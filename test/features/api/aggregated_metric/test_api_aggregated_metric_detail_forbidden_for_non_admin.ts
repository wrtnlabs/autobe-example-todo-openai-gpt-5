import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppAggregatedMetric } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAggregatedMetric";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Verify admin-only protection on aggregated metric detail endpoint for
 * non-admin callers.
 *
 * Steps:
 *
 * 1. Register and authenticate a todoUser (non-admin) using /auth/todoUser/join.
 * 2. With the authenticated non-admin session, attempt to GET
 *    /todoApp/systemAdmin/aggregatedMetrics/{aggregatedMetricId} using any
 *    UUID.
 * 3. Expect the call to fail (authorization denied). Do not assert specific HTTP
 *    status codes.
 * 4. Also verify that unauthenticated access is denied by repeating the call with
 *    a connection that has empty headers.
 *
 * Success criteria:
 *
 * - Authenticated non-admin access is denied.
 * - Unauthenticated access is denied.
 */
export async function test_api_aggregated_metric_detail_forbidden_for_non_admin(
  connection: api.IConnection,
) {
  // 1) Register and authenticate a non-admin todoUser
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: joinBody,
  });
  typia.assert<ITodoAppTodoUser.IAuthorized>(authorized);
  typia.assert<IAuthorizationToken>(authorized.token);

  // 2) Prepare a random aggregated metric id (existence should not matter)
  const aggregatedMetricId = typia.random<string & tags.Format<"uuid">>();

  // 3) Authenticated non-admin must be denied
  await TestValidator.error(
    "non-admin authenticated user cannot access aggregated metric detail",
    async () => {
      await api.functional.todoApp.systemAdmin.aggregatedMetrics.at(
        connection,
        {
          aggregatedMetricId,
        },
      );
    },
  );

  // 4) Unauthenticated access must be denied as well
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated user cannot access aggregated metric detail",
    async () => {
      await api.functional.todoApp.systemAdmin.aggregatedMetrics.at(
        unauthConn,
        {
          aggregatedMetricId,
        },
      );
    },
  );
}
