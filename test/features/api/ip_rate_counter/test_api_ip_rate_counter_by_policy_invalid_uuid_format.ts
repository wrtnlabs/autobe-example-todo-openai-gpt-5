import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppIpRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppIpRateCounter";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Validate IP rate counter retrieval with correct UUID formats and auth
 * boundary.
 *
 * This test exercises the systemAdmin retrieval of a specific IP rate counter
 * under a rate limit policy while respecting strict type-safety and access
 * control rules.
 *
 * Steps
 *
 * 1. Register (join) a systemAdmin account to obtain an authenticated context.
 * 2. Prepare valid UUIDs for both rateLimitId and ipRateCounterId.
 * 3. Perform the GET call under authenticated context and assert response type.
 * 4. Build an unauthenticated connection and ensure the same call fails.
 *
 * Notes
 *
 * - We do not attempt to send malformed UUIDs because the SDK requires `string &
 *   tags.Format<"uuid">` at compile time and type-violation tests are
 *   prohibited. Instead, we validate success flow plus an auth boundary error.
 */
export async function test_api_ip_rate_counter_by_policy_invalid_uuid_format(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const authorized: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: typia.random<ITodoAppSystemAdminJoin.ICreate>(),
    });
  typia.assert(authorized);

  // 2) Prepare valid UUIDs for path parameters
  const rateLimitId = typia.random<string & tags.Format<"uuid">>();
  const ipRateCounterId = typia.random<string & tags.Format<"uuid">>();

  // 3) Authenticated GET: should succeed with proper structure
  const counter: ITodoAppIpRateCounter =
    await api.functional.todoApp.systemAdmin.rateLimits.ipRateCounters.at(
      connection,
      {
        rateLimitId,
        ipRateCounterId,
      },
    );
  typia.assert(counter);

  // 4) Unauthenticated GET: should fail (auth boundary)
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "ipRateCounters.at must require admin authentication",
    async () => {
      await api.functional.todoApp.systemAdmin.rateLimits.ipRateCounters.at(
        unauthConn,
        {
          rateLimitId,
          ipRateCounterId,
        },
      );
    },
  );
}
