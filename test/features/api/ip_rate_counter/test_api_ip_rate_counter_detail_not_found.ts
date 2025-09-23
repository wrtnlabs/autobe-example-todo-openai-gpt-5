import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppIpRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppIpRateCounter";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Validate privacy-preserving not-found behavior for IP rate counter detail
 * with admin-only access.
 *
 * Business context:
 *
 * - IP rate counters are administrative diagnostics. Access is restricted to
 *   systemAdmin.
 * - Even for not-found records, the caller must be authorized; the API should not
 *   leak existence of other records.
 *
 * Steps:
 *
 * 1. Create an unauthenticated connection clone and attempt to fetch a random UUID
 *    → expect error (auth required).
 * 2. Join as systemAdmin (POST /auth/systemAdmin/join) to obtain authorized
 *    session.
 * 3. Call GET /todoApp/systemAdmin/ipRateCounters/{ipRateCounterId} with a random
 *    UUID that should not exist → expect error (not-found behavior), without
 *    checking specific HTTP status codes.
 */
export async function test_api_ip_rate_counter_detail_not_found(
  connection: api.IConnection,
) {
  // Generate a random, likely non-existent UUID for the target record
  const missingId = typia.random<string & tags.Format<"uuid">>();

  // 1) Admin-only access enforced: unauthenticated call should fail
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated request to IP rate counter detail must fail",
    async () => {
      await api.functional.todoApp.systemAdmin.ipRateCounters.at(unauthConn, {
        ipRateCounterId: missingId,
      });
    },
  );

  // 2) Authenticate as systemAdmin via join
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert<ITodoAppSystemAdmin.IAuthorized>(admin);

  // 3) Authorized but non-existent ID should result in error (not-found style)
  await TestValidator.error(
    "authorized request for non-existent IP rate counter must fail (privacy-preserving not-found)",
    async () => {
      await api.functional.todoApp.systemAdmin.ipRateCounters.at(connection, {
        ipRateCounterId: missingId,
      });
    },
  );
}
