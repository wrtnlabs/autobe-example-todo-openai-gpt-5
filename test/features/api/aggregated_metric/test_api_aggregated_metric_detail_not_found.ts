import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppAggregatedMetric } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAggregatedMetric";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Verify that requesting a non-existent aggregated metric returns an error
 * without leaking details.
 *
 * Business context:
 *
 * - Aggregated metric snapshots are admin-only analytics records. The detail
 *   endpoint requires systemAdmin authentication.
 * - For unknown IDs (or archived records), the backend should return a not-found
 *   style error. Tests must validate the error occurrence without asserting
 *   transport-layer status codes.
 *
 * Steps:
 *
 * 1. Register and authenticate a system admin using POST /auth/systemAdmin/join.
 * 2. Generate a random UUID presumed to be non-existent.
 * 3. Call GET /todoApp/systemAdmin/aggregatedMetrics/{aggregatedMetricId} and
 *    expect an error.
 *
 * Note on simulate mode:
 *
 * - When connection.simulate === true, the SDK returns random entities and cannot
 *   simulate not-found. In that case, call once and assert the returned type,
 *   then exit early.
 */
export async function test_api_aggregated_metric_detail_not_found(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin (SDK sets Authorization automatically)
  const adminAuth = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(adminAuth);

  // If simulate mode is enabled, the detail endpoint returns mock data; skip error assertion
  if (connection.simulate === true) {
    const demo = await api.functional.todoApp.systemAdmin.aggregatedMetrics.at(
      connection,
      {
        aggregatedMetricId: typia.random<string & tags.Format<"uuid">>(),
      },
    );
    typia.assert(demo);
    return;
  }

  // 2) Prepare a random UUID that should not exist
  const unknownId = typia.random<string & tags.Format<"uuid">>();

  // 3) Expect error (not found style) without asserting specific HTTP status codes
  await TestValidator.error(
    "non-existent aggregated metric detail should error",
    async () => {
      await api.functional.todoApp.systemAdmin.aggregatedMetrics.at(
        connection,
        { aggregatedMetricId: unknownId },
      );
    },
  );
}
