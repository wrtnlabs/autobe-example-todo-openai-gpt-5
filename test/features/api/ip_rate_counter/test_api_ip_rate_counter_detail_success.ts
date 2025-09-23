import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppIpRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppIpRateCounter";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Retrieve IP rate counter detail as system admin (happy path).
 *
 * Steps:
 *
 * 1. Authenticate as systemAdmin by performing join() to obtain an authorized
 *    session.
 * 2. Call the admin-only detail endpoint to fetch one IP rate counter by id.
 * 3. Validate response structures using typia.assert().
 *
 * Notes:
 *
 * - The SDK automatically manages Authorization header after join().
 * - Business-rule assertions like id equality or time-window ordering are
 *   intentionally omitted because simulator returns randomized data. The goal
 *   here is to validate the authenticated access path and strict DTO
 *   conformance.
 */
export async function test_api_ip_rate_counter_detail_success(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin (join)
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12), // >= 8 chars
      ip: "127.0.0.1",
      user_agent: `e2e/${RandomGenerator.alphaNumeric(8)}`,
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 2) Prepare a valid UUID for the target counter id
  const ipRateCounterId = typia.random<string & tags.Format<"uuid">>();

  // 3) Fetch IP rate counter detail
  const counter = await api.functional.todoApp.systemAdmin.ipRateCounters.at(
    connection,
    { ipRateCounterId },
  );
  typia.assert(counter);
}
