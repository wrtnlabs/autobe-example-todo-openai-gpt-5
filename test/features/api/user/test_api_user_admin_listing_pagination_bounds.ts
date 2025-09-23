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

/**
 * Validate admin user listing pagination bounds and value constraints.
 *
 * Business context: System administrators can list user accounts with paging
 * filters through PATCH /todoApp/systemAdmin/users. The request
 * ITodoAppUser.IRequest restricts page to >= 1 and limit to [1, 100]. The
 * response returns IPageITodoAppUser.ISummary with pagination metadata and a
 * list of summaries.
 *
 * Test flow:
 *
 * 1. Authenticate as systemAdmin.
 * 2. Seed multiple todoUser accounts to ensure enough records for pagination.
 *
 *    - Note: each todoUser join switches Authorization to a member token, therefore
 *         re-join as systemAdmin afterwards to restore admin context.
 * 3. Call listing with limit=1 (page=1) and validate:
 *
 *    - Pagination.limit == 1
 *    - Data.length equals min(limit, records on page 1)
 *    - Pages equals ceil(records / limit)
 * 4. Call listing with limit=100 and validate success:
 *
 *    - Pagination.limit == 100
 *    - Data.length <= 100
 *    - Pages equals ceil(records / limit)
 * 5. Validate error scenarios:
 *
 *    - Limit above maximum (101) fails
 *    - Page below minimum (0) fails
 */
export async function test_api_user_admin_listing_pagination_bounds(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const adminJoin1: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
        ip: undefined,
        user_agent: undefined,
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(adminJoin1);

  // 2) Seed several todo users to ensure multiple records exist
  const seedCount: number = 12;
  await ArrayUtil.asyncRepeat(seedCount, async () => {
    const member: ITodoAppTodoUser.IAuthorized =
      await api.functional.auth.todoUser.join(connection, {
        body: {
          email: typia.random<string & tags.Format<"email">>(),
          password: RandomGenerator.alphaNumeric(12),
        } satisfies ITodoAppTodoUser.ICreate,
      });
    typia.assert(member);
  });

  // Re-authenticate as systemAdmin to restore admin privileges after seeding
  const adminJoin2: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(adminJoin2);

  // 3) Listing with minimum page size (limit=1)
  const pageMin: IPageITodoAppUser.ISummary =
    await api.functional.todoApp.systemAdmin.users.index(connection, {
      body: {
        page: 1,
        limit: 1,
      } satisfies ITodoAppUser.IRequest,
    });
  typia.assert(pageMin);

  TestValidator.equals(
    "min limit reflected in pagination",
    pageMin.pagination.limit,
    1,
  );
  const expectedMinLength = Math.min(
    pageMin.pagination.limit,
    Math.max(
      0,
      pageMin.pagination.records - (1 - 1) * pageMin.pagination.limit,
    ),
  );
  TestValidator.equals(
    "data length equals min(limit, remaining records on page 1)",
    pageMin.data.length,
    expectedMinLength,
  );
  const expectedMinPages = Math.ceil(
    (pageMin.pagination.records || 0) / (pageMin.pagination.limit || 1),
  );
  TestValidator.equals(
    "pages equals ceil(records/limit) for limit=1",
    pageMin.pagination.pages,
    expectedMinPages,
  );

  // 4) Listing with upper bound page size (limit=100)
  const pageMax: IPageITodoAppUser.ISummary =
    await api.functional.todoApp.systemAdmin.users.index(connection, {
      body: {
        page: 1,
        limit: 100,
      } satisfies ITodoAppUser.IRequest,
    });
  typia.assert(pageMax);
  TestValidator.equals(
    "max limit reflected in pagination",
    pageMax.pagination.limit,
    100,
  );
  TestValidator.predicate(
    "data length does not exceed 100",
    pageMax.data.length <= 100,
  );
  const expectedMaxPages = Math.ceil(
    (pageMax.pagination.records || 0) / (pageMax.pagination.limit || 1),
  );
  TestValidator.equals(
    "pages equals ceil(records/limit) for limit=100",
    pageMax.pagination.pages,
    expectedMaxPages,
  );

  // 5) limit above allowed (e.g., 101) must fail
  await TestValidator.error("limit above maximum should fail", async () => {
    await api.functional.todoApp.systemAdmin.users.index(connection, {
      body: {
        page: 1,
        limit: 101, // violates tags.Maximum<100>
      } satisfies ITodoAppUser.IRequest,
    });
  });

  // 6) invalid page index (e.g., 0) must fail
  await TestValidator.error("page below minimum should fail", async () => {
    await api.functional.todoApp.systemAdmin.users.index(connection, {
      body: {
        page: 0, // violates tags.Minimum<1>
        limit: 10,
      } satisfies ITodoAppUser.IRequest,
    });
  });
}
