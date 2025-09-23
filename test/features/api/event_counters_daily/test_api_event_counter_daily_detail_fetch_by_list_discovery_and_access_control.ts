import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppEventCountersDaily } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppEventCountersDaily";
import type { ITodoAppEventCountersDaily } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEventCountersDaily";
import type { ITodoAppEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEventType";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_event_counter_daily_detail_fetch_by_list_discovery_and_access_control(
  connection: api.IConnection,
) {
  // 1) Join as systemAdmin to obtain admin privileges
  const admin1 = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin1);

  // 2) Create an event type (taxonomy) as admin for realistic analytics context
  const eventType = await api.functional.todoApp.systemAdmin.eventTypes.create(
    connection,
    {
      body: {
        code: `todo.${RandomGenerator.alphabets(8)}`,
        name: RandomGenerator.name(2),
        description: RandomGenerator.paragraph({ sentences: 6 }),
        active: true,
      } satisfies ITodoAppEventType.ICreate,
    },
  );
  typia.assert(eventType);

  // 3) Join as todoUser and create a Todo to simulate activity
  const user1 = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(user1);

  const todo = await api.functional.todoApp.todoUser.todos.create(connection, {
    body: {
      title: RandomGenerator.paragraph({ sentences: 3 }),
      description: RandomGenerator.paragraph({ sentences: 8 }),
    } satisfies ITodoAppTodo.ICreate,
  });
  typia.assert(todo);

  // 4) Switch back to admin by joining again (fresh admin session)
  const admin2 = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin2);

  // 5) Discover an id via list endpoint (PATCH index)
  const page =
    await api.functional.todoApp.systemAdmin.eventCountersDaily.index(
      connection,
      {
        body: {
          page: 1,
          limit: 20,
          sort_by: "bucket_date",
          sort_dir: "desc",
        } satisfies ITodoAppEventCountersDaily.IRequest,
      },
    );
  typia.assert(page);

  const discoveredId: (string & tags.Format<"uuid">) | undefined =
    page.data[0]?.id;

  // 6) Success path: fetch detail if an id has been discovered
  if (discoveredId) {
    const detail =
      await api.functional.todoApp.systemAdmin.eventCountersDaily.at(
        connection,
        { eventCounterDailyId: discoveredId },
      );
    typia.assert(detail);

    // Basic invariant check that is safe in both live and simulate modes
    TestValidator.predicate(
      "daily counter count must be non-negative",
      detail.count >= 0,
    );
  }

  // 7) Negative path: non-admin caller must not access admin counters detail
  const user2 = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(user2);

  await TestValidator.error(
    "non-admin cannot read system admin daily counters detail",
    async () => {
      await api.functional.todoApp.systemAdmin.eventCountersDaily.at(
        connection,
        {
          eventCounterDailyId:
            discoveredId ?? typia.random<string & tags.Format<"uuid">>(),
        },
      );
    },
  );

  // 8) Negative path: unknown id should result in error for admin caller
  const admin3 = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin3);

  await TestValidator.error(
    "admin reading non-existent daily counter should fail",
    async () => {
      await api.functional.todoApp.systemAdmin.eventCountersDaily.at(
        connection,
        { eventCounterDailyId: typia.random<string & tags.Format<"uuid">>() },
      );
    },
  );
}
