import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppServicePolicy";
import type { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

export async function test_api_service_policy_list_invalid_pagination_parameters(
  connection: api.IConnection,
) {
  /**
   * Validate pagination boundary handling and error on invalid datetime ranges
   * for service policy listing.
   *
   * Steps:
   *
   * 1. Join as system admin (authorized session via SDK).
   * 2. Call listing with page=1, limit=1 and validate pagination.limit echoes 1.
   * 3. Call listing with page=1, limit=100 and validate pagination.limit echoes
   *    100.
   * 4. Call listing with null page/limit and assert type integrity.
   * 5. Negative: invalid effective_from range (from > to) must raise an error.
   */
  // 1) Authenticate as systemAdmin via join
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: joinBody,
  });
  typia.assert(admin);

  // 2) page=1, limit=1 (minimum boundary)
  const minPageBody = {
    page: 1,
    limit: 1,
  } satisfies ITodoAppServicePolicy.IRequest;
  const minPage =
    await api.functional.todoApp.systemAdmin.servicePolicies.index(connection, {
      body: minPageBody,
    });
  typia.assert(minPage);
  TestValidator.equals(
    "min boundary: pagination.limit should be 1",
    minPage.pagination.limit,
    1,
  );

  // 3) page=1, limit=100 (maximum boundary)
  const maxPageBody = {
    page: 1,
    limit: 100,
  } satisfies ITodoAppServicePolicy.IRequest;
  const maxPage =
    await api.functional.todoApp.systemAdmin.servicePolicies.index(connection, {
      body: maxPageBody,
    });
  typia.assert(maxPage);
  TestValidator.equals(
    "max boundary: pagination.limit should be 100",
    maxPage.pagination.limit,
    100,
  );

  // 4) page=null, limit=null (DTO permits null/undefined) → should succeed with defaults
  const defaultedBody = {
    page: null,
    limit: null,
  } satisfies ITodoAppServicePolicy.IRequest;
  const defaulted =
    await api.functional.todoApp.systemAdmin.servicePolicies.index(connection, {
      body: defaultedBody,
    });
  typia.assert(defaulted);

  // 5) Negative: invalid datetime range (effective_from_from > effective_from_to)
  const later = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // +1 day
  const earlier = new Date().toISOString();
  const invalidRangeBody = {
    page: 1,
    limit: 10,
    effective_from_from: later,
    effective_from_to: earlier,
  } satisfies ITodoAppServicePolicy.IRequest;
  await TestValidator.error(
    "invalid datetime range must be rejected",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.index(
        connection,
        { body: invalidRangeBody },
      );
    },
  );
}
