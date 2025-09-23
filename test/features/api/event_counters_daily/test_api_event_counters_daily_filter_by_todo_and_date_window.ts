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

/**
 * Search daily event counters by Todo and date window with admin-only access.
 *
 * Business rationale
 *
 * - Daily counters are admin-only analytics. This test verifies that only
 *   systemAdmin can query them, and that filters for todo_id and bucket_date
 *   apply correctly with sorting and pagination.
 * - Event counters may be materialized asynchronously. Therefore, the test must
 *   accept zero results after creating a Todo and should not assert positive
 *   counts.
 *
 * Steps
 *
 * 1. Register a systemAdmin and create an event type (taxonomy present).
 * 2. Register a todoUser and create a Todo (target for filtering).
 * 3. Authorization negatives
 *
 *    - As todoUser, calling the admin-only endpoint should error.
 *    - As unauthenticated client, calling the endpoint should error.
 * 4. Switch back to systemAdmin and perform valid queries
 *
 *    - Query with todo_id and date window (bucket_date_from/to), sort by bucket_date
 *         desc and paginate.
 *    - Validate: dimensions match todo_id; bucket_date in range; sorting descending;
 *         pagination echo and cross-page ordering where applicable.
 * 5. Edge validations
 *
 *    - Invert date window (from > to) → error
 *    - Unknown todo_id → empty list
 */
export async function test_api_event_counters_daily_filter_by_todo_and_date_window(
  connection: api.IConnection,
) {
  // 1) Register a systemAdmin
  const adminEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const adminPassword: string = `P@ssw0rd-${RandomGenerator.alphaNumeric(12)}`; // 8-64 chars
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: adminEmail,
        password: adminPassword,
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(adminAuth);

  // Create an event type (taxonomy present if filters need it later)
  const eventType: ITodoAppEventType =
    await api.functional.todoApp.systemAdmin.eventTypes.create(connection, {
      body: {
        code: `todo.created.${RandomGenerator.alphaNumeric(8)}`,
        name: `Todo Created ${RandomGenerator.name(1)}`,
        description: RandomGenerator.paragraph({ sentences: 6 }),
        active: true,
      } satisfies ITodoAppEventType.ICreate,
    });
  typia.assert(eventType);

  // 2) Register a todoUser and create a Todo (this overwrites Authorization to user)
  const userEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const userPassword: string = `P@ssw0rd-${RandomGenerator.alphaNumeric(10)}`;
  const userAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email: userEmail,
        password: userPassword,
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(userAuth);

  const todo: ITodoAppTodo = await api.functional.todoApp.todoUser.todos.create(
    connection,
    {
      body: {
        title: RandomGenerator.paragraph({ sentences: 3 }),
        description: RandomGenerator.paragraph({ sentences: 12 }),
      } satisfies ITodoAppTodo.ICreate,
    },
  );
  typia.assert(todo);

  // Common date window covering today ±1 day to include current bucket
  const now = new Date();
  const fromISO = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const toISO = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  // 3) Authorization negatives
  // 3-a) As todoUser: admin-only endpoint must error
  await TestValidator.error(
    "non-admin (todoUser) cannot access event counters daily",
    async () => {
      await api.functional.todoApp.systemAdmin.eventCountersDaily.index(
        connection,
        {
          body: {
            page: 1,
            limit: 5,
            todo_id: todo.id,
            bucket_date_from: fromISO,
            bucket_date_to: toISO,
            sort_by: "bucket_date",
            sort_dir: "desc",
          } satisfies ITodoAppEventCountersDaily.IRequest,
        },
      );
    },
  );

  // 3-b) As unauthenticated client: must error
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated client cannot access event counters daily",
    async () => {
      await api.functional.todoApp.systemAdmin.eventCountersDaily.index(
        unauthConn,
        {
          body: {
            page: 1,
            limit: 3,
            todo_id: todo.id,
            bucket_date_from: fromISO,
            bucket_date_to: toISO,
            sort_by: "bucket_date",
            sort_dir: "desc",
          } satisfies ITodoAppEventCountersDaily.IRequest,
        },
      );
    },
  );

  // 4) Switch back to systemAdmin by registering another admin (new credentials)
  const adminEmail2: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const adminPassword2: string = `P@ssw0rd-${RandomGenerator.alphaNumeric(12)}`;
  const adminAuth2: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: adminEmail2,
        password: adminPassword2,
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(adminAuth2);

  // 4-a) Valid query with todo_id + date window, sorted desc
  const page1: IPageITodoAppEventCountersDaily =
    await api.functional.todoApp.systemAdmin.eventCountersDaily.index(
      connection,
      {
        body: {
          page: 1,
          limit: 3,
          todo_id: todo.id,
          bucket_date_from: fromISO,
          bucket_date_to: toISO,
          sort_by: "bucket_date",
          sort_dir: "desc",
        } satisfies ITodoAppEventCountersDaily.IRequest,
      },
    );
  typia.assert(page1);

  // Validate pagination echo and basic invariants
  TestValidator.equals(
    "pagination limit echoes request",
    page1.pagination.limit,
    3,
  );
  TestValidator.predicate(
    "records and pages are non-negative",
    page1.pagination.records >= 0 &&
      page1.pagination.pages >= 0 &&
      page1.pagination.current >= 0,
  );

  // Validate dimension and date range only when data exists
  if (page1.data.length > 0) {
    // All rows must be for the requested todo_id
    TestValidator.predicate(
      "all rows match requested todo_id",
      page1.data.every((r) => r.todo_app_todo_id === todo.id),
    );

    // bucket_date within [fromISO, toISO]
    const fromTs = Date.parse(fromISO);
    const toTs = Date.parse(toISO);
    TestValidator.predicate(
      "all bucket_date values within requested range",
      page1.data.every((r) => {
        const t = Date.parse(r.bucket_date);
        return fromTs <= t && t <= toTs;
      }),
    );

    // Sorting: bucket_date desc
    TestValidator.predicate(
      "results sorted by bucket_date desc",
      page1.data.every((r, i, arr) =>
        i === 0
          ? true
          : Date.parse(arr[i - 1].bucket_date) >= Date.parse(r.bucket_date),
      ),
    );
  }

  // 4-b) Fetch the next page to exercise pagination ordering
  const page2: IPageITodoAppEventCountersDaily =
    await api.functional.todoApp.systemAdmin.eventCountersDaily.index(
      connection,
      {
        body: {
          page: 2,
          limit: 3,
          todo_id: todo.id,
          bucket_date_from: fromISO,
          bucket_date_to: toISO,
          sort_by: "bucket_date",
          sort_dir: "desc",
        } satisfies ITodoAppEventCountersDaily.IRequest,
      },
    );
  typia.assert(page2);

  if (page1.data.length > 0 && page2.data.length > 0) {
    TestValidator.predicate(
      "first item of page1 is not older than first item of page2 (desc order)",
      Date.parse(page1.data[0].bucket_date) >=
        Date.parse(page2.data[0].bucket_date),
    );
  }

  // 5) Edge validations
  // 5-a) Inverted date window should raise an error
  await TestValidator.error(
    "inverted date window (from > to) must fail",
    async () => {
      await api.functional.todoApp.systemAdmin.eventCountersDaily.index(
        connection,
        {
          body: {
            page: 1,
            limit: 3,
            todo_id: todo.id,
            bucket_date_from: toISO, // inverted
            bucket_date_to: fromISO, // inverted
            sort_by: "bucket_date",
            sort_dir: "desc",
          } satisfies ITodoAppEventCountersDaily.IRequest,
        },
      );
    },
  );

  // 5-b) Unknown todo_id should yield empty page (not an error)
  const unknownTodoId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();
  const emptyByUnknown: IPageITodoAppEventCountersDaily =
    await api.functional.todoApp.systemAdmin.eventCountersDaily.index(
      connection,
      {
        body: {
          page: 1,
          limit: 5,
          todo_id: unknownTodoId,
          bucket_date_from: fromISO,
          bucket_date_to: toISO,
          sort_by: "bucket_date",
          sort_dir: "desc",
        } satisfies ITodoAppEventCountersDaily.IRequest,
      },
    );
  typia.assert(emptyByUnknown);
  TestValidator.equals(
    "unknown todo_id returns empty data set",
    emptyByUnknown.data.length,
    0,
  );
}
