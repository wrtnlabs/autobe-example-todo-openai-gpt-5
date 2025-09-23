import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppDailyStat } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppDailyStat";
import type { ITodoAppDailyStat } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppDailyStat";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Admin can fetch a daily stat detail by ID discovered from the list endpoint,
 * and the detail must be consistent with the summary fields. Also verifies that
 * requesting a non-existent ID yields an error response.
 *
 * Steps:
 *
 * 1. Authenticate as systemAdmin (join), SDK attaches Authorization automatically
 * 2. List daily stats (small page) to obtain a valid dailyStatId
 * 3. Fetch GET detail and validate field consistency with the chosen summary
 * 4. Try a random UUID that should not exist and validate error occurrence
 */
export async function test_api_daily_stats_detail_happy_path(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const authorized: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: typia.random<
          string & tags.MinLength<8> & tags.MaxLength<64>
        >(),
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(authorized);

  // 2) List daily stats to discover a valid ID
  const page: IPageITodoAppDailyStat.ISummary =
    await api.functional.todoApp.systemAdmin.dailyStats.index(connection, {
      body: {
        page: 1,
        limit: 5,
        sort: "stats_date desc",
      } satisfies ITodoAppDailyStat.IRequest,
    });
  typia.assert(page);

  // 3) If any item exists, fetch detail and validate consistency
  const picked: ITodoAppDailyStat.ISummary | undefined = page.data[0];
  if (picked !== undefined) {
    const detail: ITodoAppDailyStat =
      await api.functional.todoApp.systemAdmin.dailyStats.at(connection, {
        dailyStatId: picked.id,
      });
    typia.assert(detail);

    // Field consistency checks between summary and detail
    TestValidator.equals("detail.id matches summary.id", detail.id, picked.id);
    TestValidator.equals(
      "detail.stats_date matches summary.stats_date",
      detail.stats_date,
      picked.stats_date,
    );
    TestValidator.equals(
      "detail.todos_created matches summary.todos_created",
      detail.todos_created,
      picked.todos_created,
    );
    TestValidator.equals(
      "detail.todos_completed matches summary.todos_completed",
      detail.todos_completed,
      picked.todos_completed,
    );
    TestValidator.equals(
      "detail.active_users matches summary.active_users",
      detail.active_users,
      picked.active_users,
    );
    TestValidator.equals(
      "detail.completion_ratio matches summary.completion_ratio",
      detail.completion_ratio,
      picked.completion_ratio,
    );
  }

  // 4) Error handling: unknown ID should fail
  const unknownId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();
  await TestValidator.error(
    "detail query with unknown id should throw",
    async () => {
      await api.functional.todoApp.systemAdmin.dailyStats.at(connection, {
        dailyStatId: unknownId,
      });
    },
  );
}
