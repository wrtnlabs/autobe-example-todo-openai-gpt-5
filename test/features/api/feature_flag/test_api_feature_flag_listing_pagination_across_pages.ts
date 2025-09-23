import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { EOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/EOrderDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppFeatureFlag } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppFeatureFlag";
import type { ITodoAppFeatureFlag } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppFeatureFlag";
import type { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Validate multi-page pagination of feature flags listing filtered by a unique
 * namespace.
 *
 * Steps:
 *
 * 1. Join as systemAdmin (authorization handled by SDK).
 * 2. Create a service policy to own flags.
 * 3. Create N feature flags (N > limit) under that policy with a unique namespace.
 * 4. List flags via PATCH /todoApp/systemAdmin/featureFlags using namespace filter
 *    and explicit pagination.
 * 5. Validate pagination metadata, page boundaries, disjointness across pages, and
 *    that all items match the filter.
 */
export async function test_api_feature_flag_listing_pagination_across_pages(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12), // 8~64 chars
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 2) Create a service policy
  const uniqueToken = RandomGenerator.alphaNumeric(8);
  const policy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: {
          namespace: `e2e-${uniqueToken}`,
          code: `policy-${uniqueToken}`,
          name: `E2E Policy ${uniqueToken}`,
          description: RandomGenerator.paragraph({ sentences: 6 }),
          value: "true",
          value_type: "boolean",
          active: true,
        } satisfies ITodoAppServicePolicy.ICreate,
      },
    );
  typia.assert(policy);

  // 3) Create N feature flags under the policy
  const namespace = `e2e-flags-${uniqueToken}`;
  const limit = 10; // page size
  const N = 23; // total flags to create, ensures > 2 pages

  const createdFlags: ITodoAppFeatureFlag[] = [];
  for (let i = 0; i < N; i++) {
    const flag =
      await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
        connection,
        {
          policyId: policy.id,
          body: {
            namespace,
            environment: "dev",
            code: `flag-${uniqueToken}-${i}`,
            name: `E2E Flag ${i}`,
            description: RandomGenerator.paragraph({ sentences: 5 }),
            active: true,
            // bounded integer 0..100 without type assertion
            rollout_percentage: i % 101,
            target_audience: RandomGenerator.paragraph({ sentences: 4 }),
          } satisfies ITodoAppFeatureFlag.ICreate,
        },
      );
    typia.assert(flag);
    createdFlags.push(flag);
  }

  // 4) List with explicit pagination and namespace filter
  const firstPage = await api.functional.todoApp.systemAdmin.featureFlags.index(
    connection,
    {
      body: {
        page: 1,
        limit,
        namespace,
      } satisfies ITodoAppFeatureFlag.IRequest,
    },
  );
  typia.assert(firstPage);

  // Basic pagination validations
  TestValidator.equals(
    "pagination.limit should match requested limit",
    firstPage.pagination.limit,
    limit,
  );
  TestValidator.predicate(
    "first page data length should be <= limit",
    firstPage.data.length <= limit,
  );

  // Load all pages to verify disjointness and totals
  const totalRecords = firstPage.pagination.records;
  const expectedPages = Math.ceil(totalRecords / limit);
  TestValidator.equals(
    "pages should equal ceil(records/limit)",
    firstPage.pagination.pages,
    expectedPages,
  );

  const pages: IPageITodoAppFeatureFlag.ISummary[] = [firstPage];
  for (let p = 2; p <= expectedPages; p++) {
    const pageResult =
      await api.functional.todoApp.systemAdmin.featureFlags.index(connection, {
        body: {
          page: p,
          limit,
          namespace,
        } satisfies ITodoAppFeatureFlag.IRequest,
      });
    typia.assert(pageResult);
    TestValidator.predicate(
      `page ${p} data length should be <= limit`,
      pageResult.data.length <= limit,
    );
    pages.push(pageResult);
  }

  // 5) Cross-page validations
  // 5-1) All items match the filter (namespace)
  for (let i = 0; i < pages.length; i++) {
    const ok = pages[i].data.every((row) => row.namespace === namespace);
    TestValidator.predicate(
      `all items in page ${i + 1} match namespace filter`,
      ok,
    );
  }

  // 5-2) Disjointness across pages and union size equals total records
  const allIds = pages.flatMap((pg) => pg.data.map((d) => d.id));
  const uniqueIds = new Set(allIds);
  TestValidator.equals(
    "sum of page sizes equals total records",
    allIds.length,
    totalRecords,
  );
  TestValidator.equals(
    "unique ids across pages equals total records",
    uniqueIds.size,
    totalRecords,
  );

  // 5-3) Since namespace is unique to this test, total records should equal N created
  TestValidator.equals(
    "total records should equal the number of created flags in unique namespace",
    totalRecords,
    N,
  );
}
