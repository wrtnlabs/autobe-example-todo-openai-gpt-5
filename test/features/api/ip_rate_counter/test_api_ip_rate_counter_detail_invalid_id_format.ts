import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppIpRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppIpRateCounter";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Validate rejection on retrieving an IP rate counter with a non-existent (but
 * valid-format) UUID.
 *
 * Original scenario requested an invalid UUID string test. However, since the
 * SDK requires `ipRateCounterId: string & tags.Format<"uuid">`, sending an
 * invalid format would violate compile-time type-safety. Therefore, we rewrite
 * to a feasible runtime error: use a valid UUID that does not correspond to any
 * record and expect an error.
 *
 * Steps:
 *
 * 1. Authenticate as systemAdmin via join.
 * 2. Request ipRateCounter detail with a random UUID (extremely unlikely to
 *    exist).
 * 3. Expect the call to throw; assert only that an error occurs (no status code
 *    checks).
 */
export async function test_api_ip_rate_counter_detail_invalid_id_format(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin (join)
  const authorized = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert<ITodoAppSystemAdmin.IAuthorized>(authorized);

  // 2) Prepare a syntactically valid, random UUID that should not exist
  const missingId = typia.random<string & tags.Format<"uuid">>();

  // 3) Call detail endpoint expecting a runtime error (e.g., not found)
  await TestValidator.error(
    "ipRateCounters.at must throw when UUID does not exist",
    async () => {
      await api.functional.todoApp.systemAdmin.ipRateCounters.at(connection, {
        ipRateCounterId: missingId,
      });
    },
  );
}
