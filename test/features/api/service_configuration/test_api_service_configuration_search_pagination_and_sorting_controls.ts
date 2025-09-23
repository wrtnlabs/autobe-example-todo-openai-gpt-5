import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { EConfigValueType } from "@ORGANIZATION/PROJECT-api/lib/structures/EConfigValueType";
import type { EServiceConfigurationOrderBy } from "@ORGANIZATION/PROJECT-api/lib/structures/EServiceConfigurationOrderBy";
import type { ESortOrder } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortOrder";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppServiceConfiguration } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppServiceConfiguration";
import type { ITodoAppServiceConfiguration } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServiceConfiguration";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Validate pagination bounds and sorting controls for service configuration
 * search.
 *
 * Business context: System admins list configuration items with pagination and
 * sorting. The API should:
 *
 * - Enforce page >= 1 and 1 <= limit <= 100
 * - Default to created_at desc when sorting params are omitted
 * - Respect explicit sort requests like key asc
 * - Produce consistent paging without overlaps or gaps across pages
 *
 * Steps:
 *
 * 1. Join as a fresh system admin (SDK handles token automatically)
 * 2. Seed an isolated dataset under a unique namespace (37 rows)
 * 3. Validate default sorting: created_at desc across page 1 and 2
 * 4. Validate explicit sorting: key asc across page 1 and 2
 * 5. Validate pagination bounds: page/limit out-of-range must error
 */
export async function test_api_service_configuration_search_pagination_and_sorting_controls(
  connection: api.IConnection,
) {
  // 1) Authenticate as a system administrator
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: typia.random<ITodoAppSystemAdminJoin.ICreate>(),
  });
  typia.assert(admin);

  // 2) Seed configurations into a dedicated namespace
  const namespace = `ns_${RandomGenerator.alphaNumeric(8)}`;
  const total = 37; // multiple pages with limits like 10 and 15

  const createdList: ITodoAppServiceConfiguration[] =
    await ArrayUtil.asyncRepeat(total, async (index) => {
      const created =
        await api.functional.todoApp.systemAdmin.serviceConfigurations.create(
          connection,
          {
            body: {
              namespace,
              environment: null,
              key: `k_${String(index).padStart(3, "0")}`,
              value: RandomGenerator.alphabets(12),
              value_type: "string",
              is_secret: false,
              description: RandomGenerator.paragraph({ sentences: 4 }),
              active: true,
              effective_from: null,
              effective_to: null,
            } satisfies ITodoAppServiceConfiguration.ICreate,
          },
        );
      typia.assert(created);
      return created;
    });
  typia.assert(createdList);

  // 3) Default sorting validation: created_at desc (when orderBy/order omitted)
  const limit10 = 10;
  const page1 =
    await api.functional.todoApp.systemAdmin.serviceConfigurations.index(
      connection,
      {
        body: {
          namespace,
          page: 1,
          limit: limit10,
        } satisfies ITodoAppServiceConfiguration.IRequest,
      },
    );
  typia.assert(page1);

  const page2 =
    await api.functional.todoApp.systemAdmin.serviceConfigurations.index(
      connection,
      {
        body: {
          namespace,
          page: 2,
          limit: limit10,
        } satisfies ITodoAppServiceConfiguration.IRequest,
      },
    );
  typia.assert(page2);

  // Page sizes and total counters
  TestValidator.equals(
    "page1 size equals min(limit, total)",
    page1.data.length,
    Math.min(limit10, total),
  );
  TestValidator.predicate(
    "pagination.records equals seeded total",
    page1.pagination.records === total,
  );
  TestValidator.predicate(
    "pagination.pages equals ceil(total/limit)",
    page1.pagination.pages === Math.ceil(total / limit10),
  );

  // No overlap between page 1 and page 2
  const set1 = new Set(page1.data.map((x) => x.id));
  const overlaps = page2.data.filter((x) => set1.has(x.id));
  TestValidator.equals(
    "no overlap between page1 and page2",
    overlaps.length,
    0,
  );

  // Non-increasing created_at across concatenated pages (desc)
  const combinedDefault = [...page1.data, ...page2.data];
  const nonIncreasing = combinedDefault.every(
    (cfg, i, arr) => i === 0 || arr[i - 1].created_at >= cfg.created_at,
  );
  TestValidator.predicate(
    "default sort created_at desc across pages",
    nonIncreasing,
  );

  // Fetch all pages and check coverage (no gaps)
  const totalPages = page1.pagination.pages;
  const rest = await ArrayUtil.asyncRepeat(
    Math.max(0, totalPages - 1),
    async (i) =>
      await api.functional.todoApp.systemAdmin.serviceConfigurations.index(
        connection,
        {
          body: {
            namespace,
            page: i + 2,
            limit: limit10,
          } satisfies ITodoAppServiceConfiguration.IRequest,
        },
      ),
  );
  const allPages: IPageITodoAppServiceConfiguration.ISummary[] = [
    page1,
    ...rest,
  ];
  for (const p of allPages) typia.assert(p);
  const idSet = new Set<string>();
  for (const p of allPages) for (const row of p.data) idSet.add(row.id);
  TestValidator.predicate(
    "union of IDs across pages equals seeded total",
    idSet.size === total,
  );

  // 4) Explicit sorting: key asc across pages
  const limit15 = 15;
  const sort1 =
    await api.functional.todoApp.systemAdmin.serviceConfigurations.index(
      connection,
      {
        body: {
          namespace,
          page: 1,
          limit: limit15,
          orderBy: "key",
          order: "asc",
        } satisfies ITodoAppServiceConfiguration.IRequest,
      },
    );
  typia.assert(sort1);

  const sort2 =
    await api.functional.todoApp.systemAdmin.serviceConfigurations.index(
      connection,
      {
        body: {
          namespace,
          page: 2,
          limit: limit15,
          orderBy: "key",
          order: "asc",
        } satisfies ITodoAppServiceConfiguration.IRequest,
      },
    );
  typia.assert(sort2);

  // No overlap
  const s1 = new Set(sort1.data.map((x) => x.id));
  const sOverlap = sort2.data.filter((x) => s1.has(x.id));
  TestValidator.equals("no overlap for key-asc pages", sOverlap.length, 0);

  // Global ascending by key across concatenated pages
  const combinedAsc = [...sort1.data, ...sort2.data];
  const keys = combinedAsc.map((x) => x.key);
  const sortedKeys = [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  TestValidator.equals(
    "keys are globally ascending across pages",
    keys,
    sortedKeys,
  );

  // 5) Pagination bounds error cases
  await TestValidator.error("limit below minimum (0) must fail", async () => {
    await api.functional.todoApp.systemAdmin.serviceConfigurations.index(
      connection,
      {
        body: {
          namespace,
          page: 1,
          limit: 0,
        } satisfies ITodoAppServiceConfiguration.IRequest,
      },
    );
  });

  await TestValidator.error("limit above maximum (101) must fail", async () => {
    await api.functional.todoApp.systemAdmin.serviceConfigurations.index(
      connection,
      {
        body: {
          namespace,
          page: 1,
          limit: 101,
        } satisfies ITodoAppServiceConfiguration.IRequest,
      },
    );
  });

  await TestValidator.error("page below minimum (0) must fail", async () => {
    await api.functional.todoApp.systemAdmin.serviceConfigurations.index(
      connection,
      {
        body: {
          namespace,
          page: 0,
          limit: 10,
        } satisfies ITodoAppServiceConfiguration.IRequest,
      },
    );
  });
}
