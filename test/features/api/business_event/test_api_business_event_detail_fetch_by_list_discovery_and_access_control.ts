import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { EOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/EOrderDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppBusinessEvent } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppBusinessEvent";
import type { ITodoAppBusinessEvent } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppBusinessEvent";
import type { ITodoAppEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEventType";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Retrieve business event detail by discovery from listing, with access control
 * checks.
 *
 * Steps:
 *
 * 1. Join as systemAdmin (admin-A)
 * 2. Optionally create an event type (taxonomy seed)
 * 3. Join as todoUser and create a Todo to produce recent activity
 * 4. Re-join as systemAdmin (admin-B) to switch role back to admin
 * 5. Discover events via list filtered by the created todo id (fallback to
 *    unfiltered if none)
 * 6. Fetch event detail by id and validate record integrity and linkage
 * 7. Negative: attempt detail as non-admin (todoUser) → expect error
 * 8. Negative: unknown UUID as admin → expect error
 */
export async function test_api_business_event_detail_fetch_by_list_discovery_and_access_control(
  connection: api.IConnection,
) {
  // 1) Join as systemAdmin (admin-A)
  const adminEmailA: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const adminA = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: adminEmailA,
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(adminA);

  // 2) Optionally create an event type (taxonomy seed)
  const eventType = await api.functional.todoApp.systemAdmin.eventTypes.create(
    connection,
    {
      body: {
        code: `todo.created.${RandomGenerator.alphaNumeric(8)}`,
        name: `Todo Created ${RandomGenerator.alphaNumeric(6)}`,
        description: RandomGenerator.paragraph({ sentences: 6 }),
        active: true,
      } satisfies ITodoAppEventType.ICreate,
    },
  );
  typia.assert(eventType);

  // 3) Join as todoUser and create a Todo
  const userEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const todoUser = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: userEmail,
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(todoUser);

  const createdTodo = await api.functional.todoApp.todoUser.todos.create(
    connection,
    {
      body: {
        title: RandomGenerator.paragraph({ sentences: 3 }),
        description: RandomGenerator.paragraph({ sentences: 8 }),
        due_at: new Date().toISOString(),
      } satisfies ITodoAppTodo.ICreate,
    },
  );
  typia.assert(createdTodo);

  // 4) Re-join as systemAdmin (admin-B) to switch role back to admin
  const adminEmailB: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const adminB = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: adminEmailB,
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(adminB);

  // 5) Discover events via list filtered by todo id
  const pageFiltered =
    await api.functional.todoApp.systemAdmin.businessEvents.index(connection, {
      body: {
        page: 1,
        limit: 20,
        sort: "occurred_at",
        direction: "desc",
        todo_app_todo_id: createdTodo.id,
      } satisfies ITodoAppBusinessEvent.IRequest,
    });
  typia.assert(pageFiltered);

  const usedFiltered: boolean = pageFiltered.data.length > 0;

  const pageResult = usedFiltered
    ? pageFiltered
    : await api.functional.todoApp.systemAdmin.businessEvents.index(
        connection,
        {
          body: {
            page: 1,
            limit: 20,
            sort: "occurred_at",
            direction: "desc",
          } satisfies ITodoAppBusinessEvent.IRequest,
        },
      );
  typia.assert(pageResult);

  // Ensure we have at least one event before proceeding
  TestValidator.predicate(
    "there must be at least one business event to test detail retrieval",
    pageResult.data.length > 0,
  );

  const selectedEvent = pageResult.data[0];
  typia.assertGuard<ITodoAppBusinessEvent>(selectedEvent!);

  // 6) Fetch event detail by id and validate
  const detail = await api.functional.todoApp.systemAdmin.businessEvents.at(
    connection,
    { businessEventId: selectedEvent.id },
  );
  typia.assert(detail);

  TestValidator.equals(
    "detail id should match requested id",
    detail.id,
    selectedEvent.id,
  );

  if (usedFiltered) {
    TestValidator.equals(
      "detail.todo_app_todo_id should match created todo id when discovered via filter",
      detail.todo_app_todo_id,
      createdTodo.id,
    );
  }

  // 7) Negative: non-admin todoUser cannot access detail
  const otherUserEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const otherUser = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: otherUserEmail,
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(otherUser);

  await TestValidator.error(
    "non-admin cannot access business event detail",
    async () => {
      await api.functional.todoApp.systemAdmin.businessEvents.at(connection, {
        businessEventId: selectedEvent.id,
      });
    },
  );

  // 8) Negative: unknown UUID as admin → expect error
  const adminEmailC: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const adminC = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: adminEmailC,
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(adminC);

  const unknownId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();

  await TestValidator.error(
    "unknown businessEventId should cause error",
    async () => {
      await api.functional.todoApp.systemAdmin.businessEvents.at(connection, {
        businessEventId: unknownId,
      });
    },
  );
}
