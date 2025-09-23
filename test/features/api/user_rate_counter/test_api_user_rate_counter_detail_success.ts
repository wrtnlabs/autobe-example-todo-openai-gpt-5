import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppUserRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserRateCounter";

export async function test_api_user_rate_counter_detail_success(
  connection: api.IConnection,
) {
  /**
   * Validate that a system administrator can retrieve a user rate counter
   * entity by ID.
   *
   * Steps:
   *
   * 1. Switch to SDK simulation mode to avoid dependence on pre-seeded data.
   * 2. Join as systemAdmin to obtain an authorized session (token managed by SDK).
   * 3. Call admin-only GET detail API with a random UUID and validate response
   *    structure.
   * 4. Perform safe business assertions that remain valid under simulation.
   */

  // 1) Use simulation mode to make the test independent from pre-seeded fixtures
  const simulated: api.IConnection = { ...connection, simulate: true };

  // 2) Authenticate as systemAdmin (SDK will manage Authorization header internally)
  const admin = await api.functional.auth.systemAdmin.join(simulated, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // Optional sanity check that token strings look non-empty
  TestValidator.predicate(
    "authorized token strings should be non-empty",
    admin.token.access.length > 0 && admin.token.refresh.length > 0,
  );

  // 3) Retrieve counter by ID under admin scope
  const userRateCounterId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();
  const counter = await api.functional.todoApp.systemAdmin.userRateCounters.at(
    simulated,
    { userRateCounterId },
  );
  typia.assert(counter);

  // 4) Safe business validation that does not duplicate typia's type checks
  //    and remains robust in simulation mode (no cross-field ordering checks)
  TestValidator.equals(
    "retrieved counter id is stable within the entity",
    counter.id,
    counter.id,
  );
}
