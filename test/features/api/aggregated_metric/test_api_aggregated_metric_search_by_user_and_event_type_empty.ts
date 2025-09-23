import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppAggregatedMetric } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppAggregatedMetric";
import type { ITodoAppAggregatedMetric } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAggregatedMetric";
import type { ITodoAppEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEventType";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_aggregated_metric_search_by_user_and_event_type_empty(
  connection: api.IConnection,
) {
  /**
   * Validate admin-only aggregated metrics search with user and event-type
   * filters returning empty page.
   *
   * Steps:
   *
   * 1. Join as system admin
   * 2. Create an event type (admin)
   * 3. Join a member todoUser via isolated connection (to keep admin token intact)
   * 4. Search aggregated metrics as admin with filters (userId, eventTypeId,
   *    recent date window)
   * 5. Validate empty result and pagination coherence
   * 6. Negative: attempt same search as todoUser and expect an error
   */

  // 1) Authenticate as system admin
  const adminEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const adminPassword: string = RandomGenerator.alphaNumeric(12);
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: adminEmail,
        password: adminPassword,
        user_agent: `e2e/${RandomGenerator.alphaNumeric(6)}`,
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(adminAuth);

  // 2) Create an event type (admin scope)
  const eventTypeBody = {
    code: `e2e.${RandomGenerator.alphabets(8)}`,
    name: RandomGenerator.name(2),
    description: RandomGenerator.paragraph({ sentences: 6 }),
    active: true,
  } satisfies ITodoAppEventType.ICreate;
  const eventType: ITodoAppEventType =
    await api.functional.todoApp.systemAdmin.eventTypes.create(connection, {
      body: eventTypeBody,
    });
  typia.assert(eventType);

  // 3) Create a member todoUser via an isolated connection to avoid replacing admin token
  const userConn: api.IConnection = { ...connection, headers: {} };
  const userEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const userPassword: string = RandomGenerator.alphaNumeric(12);
  const todoUserAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(userConn, {
      body: {
        email: userEmail,
        password: userPassword,
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(todoUserAuth);

  // 4) Admin searches aggregated metrics with filters (user + event type) and recent window
  const now = new Date();
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  const from = new Date(now.getTime() - oneWeekMs);

  const requestBody = {
    page: 1,
    limit: 20,
    todo_app_user_id: todoUserAuth.id,
    todo_app_event_type_id: eventType.id,
    period_start_from: from.toISOString(),
    period_end_to: now.toISOString(),
    sort: "period_start desc",
  } satisfies ITodoAppAggregatedMetric.IRequest;

  const page: IPageITodoAppAggregatedMetric.ISummary =
    await api.functional.todoApp.systemAdmin.aggregatedMetrics.index(
      connection,
      {
        body: requestBody,
      },
    );
  typia.assert(page);

  // 5) Validate empty result and coherent pagination
  TestValidator.equals(
    "admin metrics search returns empty data array",
    page.data.length,
    0,
  );
  TestValidator.equals(
    "admin metrics pagination total records is zero",
    page.pagination.records,
    0,
  );
  TestValidator.equals(
    "admin metrics pagination pages is zero when no records",
    page.pagination.pages,
    0,
  );
  TestValidator.predicate(
    "pagination limit is non-negative",
    page.pagination.limit >= 0,
  );
  TestValidator.predicate(
    "pagination current page index is non-negative",
    page.pagination.current >= 0,
  );

  // 6) Negative authorization: todoUser must not access admin metrics index
  await TestValidator.error(
    "todoUser cannot access admin aggregated metrics index",
    async () => {
      await api.functional.todoApp.systemAdmin.aggregatedMetrics.index(
        userConn,
        {
          body: requestBody,
        },
      );
    },
  );
}
