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

/**
 * Aggregated metric admin search: invalid filter validation.
 *
 * This test ensures that the admin-only aggregated metrics search endpoint
 * rejects logically invalid filters while accepting valid ones. It covers
 * coherent business rules such as temporal window ordering and pagination
 * bounds.
 *
 * Steps:
 *
 * 1. Join as system admin (token attached by SDK)
 * 2. Create an event type for dimensional filtering
 * 3. Join a todo user for optional user-dimension filtering
 * 4. Baseline: successful search with valid params
 * 5. Error A: period_start_from > period_start_to should be rejected
 * 6. Error B: period_end_from > period_end_to should be rejected
 * 7. Error C: pagination out-of-range (page=0, limit=101) should be rejected
 */
export async function test_api_aggregated_metric_search_invalid_filter_validation(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
        ip: "127.0.0.1",
        user_agent: "e2e-tests/aggregated-metrics",
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(admin);

  // 2) Create an event type
  const eventType: ITodoAppEventType =
    await api.functional.todoApp.systemAdmin.eventTypes.create(connection, {
      body: {
        code: `todo.${RandomGenerator.alphabets(6)}`,
        name: RandomGenerator.name(2),
        description: RandomGenerator.paragraph({ sentences: 6 }),
        active: true,
      } satisfies ITodoAppEventType.ICreate,
    });
  typia.assert(eventType);

  // 3) Create a regular todo user
  const user: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(user);

  // Helper timestamps to build logical windows
  const now: Date = new Date();
  const earlierIso: string = new Date(
    now.getTime() - 60 * 60 * 1000,
  ).toISOString(); // now - 1h
  const laterIso: string = new Date(
    now.getTime() + 60 * 60 * 1000,
  ).toISOString(); // now + 1h

  // 4) Baseline successful search (minimal valid request)
  const baseline: IPageITodoAppAggregatedMetric.ISummary =
    await api.functional.todoApp.systemAdmin.aggregatedMetrics.index(
      connection,
      {
        body: {
          page: 1,
          limit: 10,
        } satisfies ITodoAppAggregatedMetric.IRequest,
      },
    );
  typia.assert(baseline);

  // 5) Error A: period_start_from > period_start_to
  await TestValidator.error(
    "rejects period_start window when `from` is greater than `to`",
    async () => {
      await api.functional.todoApp.systemAdmin.aggregatedMetrics.index(
        connection,
        {
          body: {
            page: 1,
            limit: 10,
            period_start_from: laterIso,
            period_start_to: earlierIso,
            // valid dimension filters alongside invalid window
            todo_app_user_id: user.id,
            todo_app_event_type_id: eventType.id,
          } satisfies ITodoAppAggregatedMetric.IRequest,
        },
      );
    },
  );

  // 6) Error B: period_end_from > period_end_to
  await TestValidator.error(
    "rejects period_end window when `from` is greater than `to`",
    async () => {
      await api.functional.todoApp.systemAdmin.aggregatedMetrics.index(
        connection,
        {
          body: {
            page: 1,
            limit: 10,
            metric_key: "todos.created",
            granularity: "day",
            period_end_from: laterIso,
            period_end_to: earlierIso,
          } satisfies ITodoAppAggregatedMetric.IRequest,
        },
      );
    },
  );

  // 7) Error C: pagination out-of-range (page below min, limit above max)
  await TestValidator.error(
    "rejects pagination values outside allowed bounds (page < 1 or limit > 100)",
    async () => {
      await api.functional.todoApp.systemAdmin.aggregatedMetrics.index(
        connection,
        {
          body: {
            page: 0, // Minimum is 1
            limit: 101, // Maximum is 100
          } satisfies ITodoAppAggregatedMetric.IRequest,
        },
      );
    },
  );
}
