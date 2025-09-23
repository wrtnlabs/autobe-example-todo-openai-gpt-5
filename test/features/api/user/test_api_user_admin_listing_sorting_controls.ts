import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { EOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/EOrderDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppUser } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppUser";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUser";

export async function test_api_user_admin_listing_sorting_controls(
  connection: api.IConnection,
) {
  /**
   * Validate user listing sorting and pagination behavior for systemAdmin.
   *
   * Steps:
   *
   * 1. Admin join to obtain admin token on the primary connection
   * 2. Seed three todoUser accounts on a separate connection to preserve the admin
   *    token
   * 3. Verify default sorting (created_at desc) across pages and against explicit
   *    baseline
   * 4. Verify created_at asc sorting across pages and against baseline
   * 5. Verify email asc lexical ordering (single page and across pages)
   */
  // 1) Admin join (primary connection retains admin token)
  const adminEmail = `admin.${RandomGenerator.alphaNumeric(8)}@e2e.test.com`;
  const adminPassword = "P@ssw0rd123"; // 8-64 chars
  const adminAuth = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: adminEmail,
      password: adminPassword,
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(adminAuth);

  // 2) Prepare a separate connection for seeding members to avoid overwriting admin token
  const memberConn: api.IConnection = { ...connection, headers: {} };

  // Deterministic, lexically ordered prefixes to validate email asc ordering
  const prefixes = ["a", "b", "c"] as const;
  const userEmails = prefixes.map(
    (p) => `${p}.${RandomGenerator.alphaNumeric(8)}@e2e.test.com`,
  );

  const userAuths: ITodoAppTodoUser.IAuthorized[] = [];
  for (const email of userEmails) {
    const created = await api.functional.auth.todoUser.join(memberConn, {
      body: {
        email,
        password: "P@ssw0rd123",
      } satisfies ITodoAppTodoUser.ICreate,
    });
    typia.assert(created);
    userAuths.push(created);
  }

  const ids = userAuths.map((u) => u.id);

  // Helper: extract timestamps and check order
  const isNonIncreasing = (values: string[]): boolean => {
    for (let i = 1; i < values.length; i++) {
      if (new Date(values[i - 1]).getTime() < new Date(values[i]).getTime())
        return false;
    }
    return true;
  };
  const isNonDecreasing = (values: string[]): boolean => {
    for (let i = 1; i < values.length; i++) {
      if (new Date(values[i - 1]).getTime() > new Date(values[i]).getTime())
        return false;
    }
    return true;
  };

  // 3) Default sorting (created_at desc). Validate across pages and against explicit desc baseline
  const page1Default = await api.functional.todoApp.systemAdmin.users.index(
    connection,
    {
      body: {
        ids,
        limit: 2,
      } satisfies ITodoAppUser.IRequest,
    },
  );
  typia.assert(page1Default);

  const page2Default = await api.functional.todoApp.systemAdmin.users.index(
    connection,
    {
      body: {
        ids,
        limit: 2,
        page: 2,
      } satisfies ITodoAppUser.IRequest,
    },
  );
  typia.assert(page2Default);

  TestValidator.equals(
    "default page1 current page is 1",
    page1Default.pagination.current,
    1,
  );
  TestValidator.equals(
    "default page2 current page is 2",
    page2Default.pagination.current,
    2,
  );
  TestValidator.equals(
    "default page1 limit matches request",
    page1Default.pagination.limit,
    2,
  );
  TestValidator.equals(
    "default total records equals seeded (page1)",
    page1Default.pagination.records,
    ids.length,
  );
  TestValidator.equals(
    "default total records equals seeded (page2)",
    page2Default.pagination.records,
    ids.length,
  );

  const mergedDefault = [...page1Default.data, ...page2Default.data];
  TestValidator.equals(
    "merged default pages cover all seeded users",
    mergedDefault.length,
    ids.length,
  );

  const baselineDesc = await api.functional.todoApp.systemAdmin.users.index(
    connection,
    {
      body: {
        ids,
        order_by: "created_at",
        order_direction: "desc",
        limit: 100,
        page: 1,
      } satisfies ITodoAppUser.IRequest,
    },
  );
  typia.assert(baselineDesc);

  TestValidator.equals(
    "default ordering equals explicit created_at desc",
    mergedDefault.map((u) => u.id),
    baselineDesc.data.map((u) => u.id),
  );

  TestValidator.predicate(
    "default merged created_at should be non-increasing",
    isNonIncreasing(mergedDefault.map((u) => u.created_at)),
  );

  // 4) created_at asc sorting across pages, plus baseline comparison
  const page1Asc = await api.functional.todoApp.systemAdmin.users.index(
    connection,
    {
      body: {
        ids,
        order_by: "created_at",
        order_direction: "asc",
        limit: 2,
      } satisfies ITodoAppUser.IRequest,
    },
  );
  typia.assert(page1Asc);

  const page2Asc = await api.functional.todoApp.systemAdmin.users.index(
    connection,
    {
      body: {
        ids,
        order_by: "created_at",
        order_direction: "asc",
        limit: 2,
        page: 2,
      } satisfies ITodoAppUser.IRequest,
    },
  );
  typia.assert(page2Asc);

  TestValidator.equals(
    "asc page1 current page is 1",
    page1Asc.pagination.current,
    1,
  );
  TestValidator.equals(
    "asc page2 current page is 2",
    page2Asc.pagination.current,
    2,
  );

  const mergedAsc = [...page1Asc.data, ...page2Asc.data];
  TestValidator.equals(
    "asc merged pages cover all seeded users",
    mergedAsc.length,
    ids.length,
  );

  TestValidator.predicate(
    "created_at asc merged should be non-decreasing",
    isNonDecreasing(mergedAsc.map((u) => u.created_at)),
  );

  const baselineAsc = await api.functional.todoApp.systemAdmin.users.index(
    connection,
    {
      body: {
        ids,
        order_by: "created_at",
        order_direction: "asc",
        limit: 100,
        page: 1,
      } satisfies ITodoAppUser.IRequest,
    },
  );
  typia.assert(baselineAsc);

  TestValidator.equals(
    "asc merged equals asc baseline",
    mergedAsc.map((u) => u.id),
    baselineAsc.data.map((u) => u.id),
  );

  // 5) email asc sorting: baseline single page and two-page consistency + lexical expectation
  const emailAscBaseline = await api.functional.todoApp.systemAdmin.users.index(
    connection,
    {
      body: {
        ids,
        order_by: "email",
        order_direction: "asc",
        limit: 100,
        page: 1,
      } satisfies ITodoAppUser.IRequest,
    },
  );
  typia.assert(emailAscBaseline);

  const expectedEmailAsc = [...userEmails].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  TestValidator.equals(
    "email asc baseline follows lexical order",
    emailAscBaseline.data.map((u) => u.email),
    expectedEmailAsc,
  );

  const emailAscPage1 = await api.functional.todoApp.systemAdmin.users.index(
    connection,
    {
      body: {
        ids,
        order_by: "email",
        order_direction: "asc",
        limit: 2,
      } satisfies ITodoAppUser.IRequest,
    },
  );
  typia.assert(emailAscPage1);

  const emailAscPage2 = await api.functional.todoApp.systemAdmin.users.index(
    connection,
    {
      body: {
        ids,
        order_by: "email",
        order_direction: "asc",
        limit: 2,
        page: 2,
      } satisfies ITodoAppUser.IRequest,
    },
  );
  typia.assert(emailAscPage2);

  const mergedEmailAsc = [...emailAscPage1.data, ...emailAscPage2.data];
  TestValidator.equals(
    "email asc merged pages equal baseline order",
    mergedEmailAsc.map((u) => u.id),
    emailAscBaseline.data.map((u) => u.id),
  );
}
