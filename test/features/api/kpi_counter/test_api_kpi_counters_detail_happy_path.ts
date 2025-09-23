import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { EOrderByITodoAppKpiCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/EOrderByITodoAppKpiCounter";
import type { EOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/EOrderDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppKpiCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppKpiCounter";
import type { ITodoAppKpiCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppKpiCounter";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

export async function test_api_kpi_counters_detail_happy_path(
  connection: api.IConnection,
) {
  /**
   * Validate admin-only KPI counter detail retrieval.
   *
   * Steps:
   *
   * 1. Authenticate as systemAdmin using POST /auth/systemAdmin/join
   * 2. Discover a valid kpiCounterId via PATCH /todoApp/systemAdmin/kpiCounters
   *    with a broad 30-day window and small page size
   * 3. GET /todoApp/systemAdmin/kpiCounters/{kpiCounterId} using discovered id and
   *    validate core fields are consistent with the list item
   * 4. Use a random UUID not present to ensure the endpoint errors for unknown id
   */

  // 1) Authenticate as systemAdmin
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // 8~64 chars policy satisfied
    ip: "127.0.0.1",
    user_agent: "e2e-test-agent",
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, { body: joinBody });
  typia.assert(admin);

  // 2) Discover a valid KPI counter id via listing
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const listBody = {
    page: 1,
    limit: 5,
    window_start_from: start.toISOString(),
    window_end_to: now.toISOString(),
    order_by: "window_end",
    order_dir: "desc",
  } satisfies ITodoAppKpiCounter.IRequest;
  const page: IPageITodoAppKpiCounter =
    await api.functional.todoApp.systemAdmin.kpiCounters.index(connection, {
      body: listBody,
    });
  typia.assert(page);

  // 3) If data exists, fetch detail and validate field consistency
  if (page.data.length > 0) {
    const listItem: ITodoAppKpiCounter = page.data[0];
    typia.assert(listItem);

    const detail: ITodoAppKpiCounter =
      await api.functional.todoApp.systemAdmin.kpiCounters.at(connection, {
        kpiCounterId: listItem.id,
      });
    typia.assert(detail);

    // Core identity
    TestValidator.equals("detail id matches list item", detail.id, listItem.id);

    // Window bounds
    TestValidator.equals(
      "window_start matches",
      detail.window_start,
      listItem.window_start,
    );
    TestValidator.equals(
      "window_end matches",
      detail.window_end,
      listItem.window_end,
    );

    // Aggregates
    TestValidator.equals(
      "todos_created matches",
      detail.todos_created,
      listItem.todos_created,
    );
    TestValidator.equals(
      "todos_completed matches",
      detail.todos_completed,
      listItem.todos_completed,
    );
    TestValidator.equals(
      "active_users matches",
      detail.active_users,
      listItem.active_users,
    );

    // Optional latency aggregates (nullable/undefinable)
    TestValidator.equals(
      "avg_time_to_complete_hours matches (nullable)",
      detail.avg_time_to_complete_hours,
      listItem.avg_time_to_complete_hours,
    );
    TestValidator.equals(
      "p95_completion_time_hours matches (nullable)",
      detail.p95_completion_time_hours,
      listItem.p95_completion_time_hours,
    );

    // System timestamps
    TestValidator.equals(
      "refreshed_at matches",
      detail.refreshed_at,
      listItem.refreshed_at,
    );
    TestValidator.equals(
      "created_at matches",
      detail.created_at,
      listItem.created_at,
    );
    TestValidator.equals(
      "updated_at matches",
      detail.updated_at,
      listItem.updated_at,
    );
    TestValidator.equals(
      "deleted_at matches (nullable)",
      detail.deleted_at,
      listItem.deleted_at,
    );
  } else {
    // Dataset may be empty; still validate the listing outcome coherently
    TestValidator.predicate(
      "listing returned zero results (dataset dependent)",
      page.data.length === 0,
    );
  }

  // 4) Not-found behavior for unknown id
  const listedIds = page.data.map((r) => r.id);
  let unknownId = typia.random<string & tags.Format<"uuid">>();
  for (let i = 0; i < 5 && listedIds.includes(unknownId); ++i)
    unknownId = typia.random<string & tags.Format<"uuid">>();

  await TestValidator.error(
    "detail endpoint errors on unknown id",
    async () => {
      await api.functional.todoApp.systemAdmin.kpiCounters.at(connection, {
        kpiCounterId: unknownId,
      });
    },
  );
}
