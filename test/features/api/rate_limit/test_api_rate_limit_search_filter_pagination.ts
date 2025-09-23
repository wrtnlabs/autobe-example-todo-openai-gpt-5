import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ERateLimitCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ERateLimitCategory";
import type { ERateLimitScope } from "@ORGANIZATION/PROJECT-api/lib/structures/ERateLimitScope";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppRateLimit } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppRateLimit";
import type { ITodoAppRateLimit } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppRateLimit";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Validate admin search/filter/pagination for rate limit policies and exclusion
 * of logically deleted entries.
 *
 * Business flow:
 *
 * 1. Admin joins (auth).
 * 2. Seed three policies using a unique searchable prefix: A (user/auth/enabled),
 *    B (ip/read/disabled), C (global/write/enabled).
 * 3. Update C (e.g., change name and category), then delete C (logical delete) to
 *    ensure it is excluded from listings.
 * 4. Search with the unique prefix and verify only A and B appear with correct
 *    pagination metadata.
 * 5. Verify filters (scope, category, enabled, sliding_window) return the correct
 *    subsets.
 *
 * Notes:
 *
 * - Use only IRequest-supported filters; no sorting parameters exist in IRequest.
 * - Use typia.assert to create tagged numeric values when needed (page/limit and
 *   numeric fields in create).
 */
export async function test_api_rate_limit_search_filter_pagination(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin via join (SDK sets token automatically)
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: typia.random<
          string & tags.MinLength<8> & tags.MaxLength<64>
        >(),
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(adminAuth);

  // Unique prefix to isolate our seeded data in searches
  const prefix: string = `e2e_rl_${RandomGenerator.alphaNumeric(8)}`;

  // Helper numeric values with tagged types
  const page1 = typia.assert<number & tags.Type<"int32"> & tags.Minimum<1>>(1);
  const limit10 = typia.assert<number & tags.Type<"int32"> & tags.Minimum<1>>(
    10,
  );
  const ws60 = typia.assert<number & tags.Type<"int32"> & tags.Minimum<1>>(60);
  const ws120 = typia.assert<number & tags.Type<"int32"> & tags.Minimum<1>>(
    120,
  );
  const mr10 = typia.assert<number & tags.Type<"int32"> & tags.Minimum<1>>(10);
  const mr50 = typia.assert<number & tags.Type<"int32"> & tags.Minimum<1>>(50);

  // 2) Seed policies A, B, C
  const policyA: ITodoAppRateLimit =
    await api.functional.todoApp.systemAdmin.rateLimits.create(connection, {
      body: {
        code: `${prefix}_A`,
        name: `A ${prefix}`,
        description: RandomGenerator.paragraph({ sentences: 6 }),
        scope: "user",
        category: "auth",
        window_seconds: ws60,
        max_requests: mr10,
        sliding_window: false,
        enabled: true,
      } satisfies ITodoAppRateLimit.ICreate,
    });
  typia.assert(policyA);

  const policyB: ITodoAppRateLimit =
    await api.functional.todoApp.systemAdmin.rateLimits.create(connection, {
      body: {
        code: `${prefix}_B`,
        name: `B ${prefix}`,
        description: RandomGenerator.paragraph({ sentences: 6 }),
        scope: "ip",
        category: "read",
        window_seconds: ws120,
        max_requests: mr50,
        sliding_window: true,
        enabled: false,
      } satisfies ITodoAppRateLimit.ICreate,
    });
  typia.assert(policyB);

  const policyC: ITodoAppRateLimit =
    await api.functional.todoApp.systemAdmin.rateLimits.create(connection, {
      body: {
        code: `${prefix}_C`,
        name: `C ${prefix}`,
        description: RandomGenerator.paragraph({ sentences: 6 }),
        scope: "global",
        category: "write",
        window_seconds: ws60,
        max_requests: mr10,
        sliding_window: false,
        enabled: true,
      } satisfies ITodoAppRateLimit.ICreate,
    });
  typia.assert(policyC);

  // 3) Update C (change name and category), then delete it
  const updatedC: ITodoAppRateLimit =
    await api.functional.todoApp.systemAdmin.rateLimits.update(connection, {
      rateLimitId: policyC.id,
      body: {
        name: `C-updated ${prefix}`,
        category: "auth",
      } satisfies ITodoAppRateLimit.IUpdate,
    });
  typia.assert(updatedC);

  await api.functional.todoApp.systemAdmin.rateLimits.erase(connection, {
    rateLimitId: policyC.id,
  });

  // 4) Search by unique prefix - only A and B should remain
  const pageAll: IPageITodoAppRateLimit.ISummary =
    await api.functional.todoApp.systemAdmin.rateLimits.index(connection, {
      body: {
        search: prefix,
        page: page1,
        limit: limit10,
      } satisfies ITodoAppRateLimit.IRequest,
    });
  typia.assert(pageAll);

  // Validate: exactly 2 records (A and B); deleted C excluded
  TestValidator.equals(
    "search by prefix returns exactly 2 records",
    pageAll.pagination.records,
    2,
  );
  TestValidator.equals(
    "data length equals 2 when limit >= 2",
    pageAll.data.length,
    2,
  );
  const actualIdsAll = pageAll.data.map((d) => d.id).sort();
  const expectedIdsAll = [policyA.id, policyB.id].sort();
  TestValidator.equals(
    "search result IDs match A and B",
    actualIdsAll,
    expectedIdsAll,
  );
  TestValidator.predicate(
    "deleted policy C must not be present",
    pageAll.data.every((d) => d.id !== policyC.id),
  );

  // 5) Filters
  // scope=ip -> only B
  const byScopeIp: IPageITodoAppRateLimit.ISummary =
    await api.functional.todoApp.systemAdmin.rateLimits.index(connection, {
      body: {
        search: prefix,
        scope: "ip",
        page: page1,
        limit: limit10,
      } satisfies ITodoAppRateLimit.IRequest,
    });
  typia.assert(byScopeIp);
  TestValidator.equals(
    "scope=ip returns one record",
    byScopeIp.pagination.records,
    1,
  );
  TestValidator.equals(
    "scope=ip data[0] is policy B",
    byScopeIp.data[0]?.id,
    policyB.id,
  );

  // category=auth -> A only (C was updated to auth then deleted)
  const byCategoryAuth: IPageITodoAppRateLimit.ISummary =
    await api.functional.todoApp.systemAdmin.rateLimits.index(connection, {
      body: {
        search: prefix,
        category: "auth",
        page: page1,
        limit: limit10,
      } satisfies ITodoAppRateLimit.IRequest,
    });
  typia.assert(byCategoryAuth);
  TestValidator.equals(
    "category=auth returns one record",
    byCategoryAuth.pagination.records,
    1,
  );
  TestValidator.equals(
    "category=auth data[0] is policy A",
    byCategoryAuth.data[0]?.id,
    policyA.id,
  );

  // enabled=true -> A only
  const enabledTrue: IPageITodoAppRateLimit.ISummary =
    await api.functional.todoApp.systemAdmin.rateLimits.index(connection, {
      body: {
        search: prefix,
        enabled: true,
        page: page1,
        limit: limit10,
      } satisfies ITodoAppRateLimit.IRequest,
    });
  typia.assert(enabledTrue);
  TestValidator.equals(
    "enabled=true returns one record",
    enabledTrue.pagination.records,
    1,
  );
  TestValidator.equals(
    "enabled=true data[0] is policy A",
    enabledTrue.data[0]?.id,
    policyA.id,
  );

  // enabled=false -> B only
  const enabledFalse: IPageITodoAppRateLimit.ISummary =
    await api.functional.todoApp.systemAdmin.rateLimits.index(connection, {
      body: {
        search: prefix,
        enabled: false,
        page: page1,
        limit: limit10,
      } satisfies ITodoAppRateLimit.IRequest,
    });
  typia.assert(enabledFalse);
  TestValidator.equals(
    "enabled=false returns one record",
    enabledFalse.pagination.records,
    1,
  );
  TestValidator.equals(
    "enabled=false data[0] is policy B",
    enabledFalse.data[0]?.id,
    policyB.id,
  );

  // sliding_window=true -> B, false -> A
  const slidingTrue: IPageITodoAppRateLimit.ISummary =
    await api.functional.todoApp.systemAdmin.rateLimits.index(connection, {
      body: {
        search: prefix,
        sliding_window: true,
        page: page1,
        limit: limit10,
      } satisfies ITodoAppRateLimit.IRequest,
    });
  typia.assert(slidingTrue);
  TestValidator.equals(
    "sliding_window=true returns one record",
    slidingTrue.pagination.records,
    1,
  );
  TestValidator.equals(
    "sliding_window=true data[0] is policy B",
    slidingTrue.data[0]?.id,
    policyB.id,
  );

  const slidingFalse: IPageITodoAppRateLimit.ISummary =
    await api.functional.todoApp.systemAdmin.rateLimits.index(connection, {
      body: {
        search: prefix,
        sliding_window: false,
        page: page1,
        limit: limit10,
      } satisfies ITodoAppRateLimit.IRequest,
    });
  typia.assert(slidingFalse);
  TestValidator.equals(
    "sliding_window=false returns one record",
    slidingFalse.pagination.records,
    1,
  );
  TestValidator.equals(
    "sliding_window=false data[0] is policy A",
    slidingFalse.data[0]?.id,
    policyA.id,
  );
}
