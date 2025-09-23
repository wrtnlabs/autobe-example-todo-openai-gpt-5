import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppUserRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserRateCounter";

/**
 * Verify that fetching a non-existent user rate counter by ID results in an
 * error.
 *
 * Steps:
 *
 * 1. Register (join) as system administrator to isolate the behavior from
 *    authorization errors.
 * 2. Generate a random UUID and attempt to fetch a user rate counter using it.
 * 3. Expect an error (e.g., not-found) and validate by asserting an error is
 *    thrown.
 *
 * Constraints:
 *
 * - Do not test specific HTTP status codes or error message shapes.
 * - Maintain strict type-safety and do not send wrong-typed data.
 * - Never touch connection.headers directly; authentication is handled by SDK.
 */
export async function test_api_user_rate_counter_not_found(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const adminAuth = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(adminAuth);

  // 2) Prepare a random UUID that should not exist
  const userRateCounterId = typia.random<string & tags.Format<"uuid">>();

  // 3) Expect an error when trying to load a non-existent counter
  await TestValidator.error(
    "non-existent userRateCounter should result in error",
    async () => {
      await api.functional.todoApp.systemAdmin.userRateCounters.at(connection, {
        userRateCounterId,
      });
    },
  );
}
