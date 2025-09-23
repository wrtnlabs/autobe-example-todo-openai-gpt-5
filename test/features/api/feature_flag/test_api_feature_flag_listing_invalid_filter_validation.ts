import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { EOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/EOrderDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppFeatureFlag } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppFeatureFlag";
import type { ITodoAppFeatureFlag } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppFeatureFlag";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Validate that the feature flag listing rejects invalid filters.
 *
 * Flow:
 *
 * 1. Join as a system admin to acquire authorized context (SDK sets token
 *    automatically).
 * 2. Call listing with invalid rollout percentage values (below 0, above 100) →
 *    expect error.
 * 3. Call listing with rollout_min > rollout_max (both within [0,100]) → expect
 *    error.
 * 4. Call listing with logically inverted time window (start_from > start_to)
 *    using valid ISO strings → expect error.
 * 5. Call listing with a valid baseline request (no invalid filters) → expect
 *    success and a valid page payload.
 */
export async function test_api_feature_flag_listing_invalid_filter_validation(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: typia.random<ITodoAppSystemAdminJoin.ICreate>(),
  });
  typia.assert(admin);

  // Helper: two ISO timestamps with tStart > tEnd to simulate inverted range
  const now = new Date();
  const tStart = new Date(now.getTime() + 60_000).toISOString(); // now + 1 minute
  const tEnd = new Date(now.getTime() - 60_000).toISOString(); // now - 1 minute

  // 2) rollout_min below 0 → expect validation error
  await TestValidator.error("rejects rollout_min < 0", async () => {
    await api.functional.todoApp.systemAdmin.featureFlags.index(connection, {
      body: {
        rollout_min: -1,
      } satisfies ITodoAppFeatureFlag.IRequest,
    });
  });

  // 3) rollout_max above 100 → expect validation error
  await TestValidator.error("rejects rollout_max > 100", async () => {
    await api.functional.todoApp.systemAdmin.featureFlags.index(connection, {
      body: {
        rollout_max: 101,
      } satisfies ITodoAppFeatureFlag.IRequest,
    });
  });

  // 4) rollout_min > rollout_max while inside [0,100] → expect validation error
  await TestValidator.error(
    "rejects rollout_min greater than rollout_max",
    async () => {
      await api.functional.todoApp.systemAdmin.featureFlags.index(connection, {
        body: {
          rollout_min: 80,
          rollout_max: 60,
        } satisfies ITodoAppFeatureFlag.IRequest,
      });
    },
  );

  // 5) Inverted time window using valid ISO strings (logical error, not type error) → expect validation error
  await TestValidator.error(
    "rejects inverted time window: start_from > start_to",
    async () => {
      await api.functional.todoApp.systemAdmin.featureFlags.index(connection, {
        body: {
          start_from: tStart,
          start_to: tEnd,
        } satisfies ITodoAppFeatureFlag.IRequest,
      });
    },
  );

  // 6) Baseline valid call (no invalid filters) → expect success
  const page = await api.functional.todoApp.systemAdmin.featureFlags.index(
    connection,
    {
      body: {} satisfies ITodoAppFeatureFlag.IRequest,
    },
  );
  typia.assert(page);
}
