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

export async function test_api_aggregated_metric_search_authorization_enforcement(
  connection: api.IConnection,
) {
  /**
   * Verify admin-only access constraint of aggregated metrics index API.
   *
   * Steps:
   *
   * 1. Register a system admin and obtain admin token (auto-managed by SDK).
   * 2. As admin, create an event type to have a valid dimension id.
   * 3. Register a non-admin todoUser (switches token to user context).
   * 4. Attempt PATCH /todoApp/systemAdmin/aggregatedMetrics as the non-admin →
   *    expect error.
   * 5. Attempt the same call on an unauthenticated connection → expect error.
   */
  // 1) Admin joins (admin token set automatically on connection)
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: adminJoinBody,
    });
  typia.assert(adminAuth);

  // 2) Create an event type as admin
  const eventTypeBody = {
    code: `metric.${RandomGenerator.alphaNumeric(8)}`,
    name: RandomGenerator.name(),
    description: RandomGenerator.paragraph({ sentences: 6 }),
    active: true,
  } satisfies ITodoAppEventType.ICreate;
  const eventType: ITodoAppEventType =
    await api.functional.todoApp.systemAdmin.eventTypes.create(connection, {
      body: eventTypeBody,
    });
  typia.assert(eventType);

  // 3) Register a non-admin todoUser (switches Authorization to user token automatically)
  const userJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const userAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: userJoinBody });
  typia.assert(userAuth);

  // Shared request body for metrics search
  const searchBody = {
    page: 1,
    limit: 10,
    sort: "created_at desc",
    todo_app_event_type_id: eventType.id,
  } satisfies ITodoAppAggregatedMetric.IRequest;

  // 4) Non-admin should be denied
  await TestValidator.error(
    "non-admin user cannot access aggregated metrics",
    async () => {
      await api.functional.todoApp.systemAdmin.aggregatedMetrics.index(
        connection,
        { body: searchBody },
      );
    },
  );

  // 5) Unauthenticated connection should be denied
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated caller cannot access aggregated metrics",
    async () => {
      await api.functional.todoApp.systemAdmin.aggregatedMetrics.index(
        unauthConn,
        { body: searchBody },
      );
    },
  );
}
