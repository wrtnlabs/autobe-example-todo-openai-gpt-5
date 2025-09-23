import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { ESortTodoAppUserRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortTodoAppUserRateCounter";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppUserRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppUserRateCounter";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppUserRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserRateCounter";

/**
 * Validate that malformed UUID in rateLimitId path parameter triggers
 * validation error.
 *
 * Steps:
 *
 * 1. Join as systemAdmin (POST /auth/systemAdmin/join) to obtain authenticated
 *    context.
 * 2. Invoke PATCH /todoApp/systemAdmin/rateLimits/not-a-uuid/userRateCounters with
 *    a minimal valid body.
 * 3. Expect the API to reject the request due to invalid UUID format for
 *    rateLimitId.
 *
 * Notes:
 *
 * - We only assert that an error occurs (do not assert specific HTTP status codes
 *   or messages).
 * - Request body for the search is ITodoAppUserRateCounter.IRequest; all fields
 *   are optional, so {} is valid.
 */
export async function test_api_rate_limit_user_counters_invalid_rate_limit_id_format(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: typia.random<ITodoAppSystemAdminJoin.ICreate>(),
  });
  typia.assert<ITodoAppSystemAdmin.IAuthorized>(admin);

  // 2) Call the endpoint with an invalid UUID in the path and minimal valid body
  await TestValidator.error(
    "invalid UUID in rateLimitId should cause validation error",
    async () => {
      await api.functional.todoApp.systemAdmin.rateLimits.userRateCounters.index(
        connection,
        {
          rateLimitId: "not-a-uuid",
          body: {} satisfies ITodoAppUserRateCounter.IRequest,
        },
      );
    },
  );
}
