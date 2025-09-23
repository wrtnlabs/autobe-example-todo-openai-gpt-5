import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppIpRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppIpRateCounter";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Verify non-admin user access is forbidden for IP rate counter detail.
 *
 * Steps:
 *
 * 1. Register and authenticate a regular member (todoUser) via
 *    /auth/todoUser/join.
 * 2. Invoke admin-only endpoint GET
 *    /todoApp/systemAdmin/ipRateCounters/{ipRateCounterId} using a random UUID
 *    while logged in as todoUser.
 * 3. Validate that the call fails (authorization denial). We do not assert any
 *    specific HTTP status code; only that an error occurs.
 */
export async function test_api_ip_rate_counter_detail_forbidden_for_non_admin(
  connection: api.IConnection,
) {
  // 1) Authenticate as a regular member (todoUser)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    // 12-char alphanumeric password (>= 8 and <= 64)
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;

  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // 2) Attempt to access admin-only resource while authenticated as todoUser
  const targetId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();

  // 3) Expect authorization failure (do not validate specific status code)
  await TestValidator.error(
    "non-admin todoUser cannot access system admin ip rate counter detail",
    async () => {
      await api.functional.todoApp.systemAdmin.ipRateCounters.at(connection, {
        ipRateCounterId: targetId,
      });
    },
  );
}
