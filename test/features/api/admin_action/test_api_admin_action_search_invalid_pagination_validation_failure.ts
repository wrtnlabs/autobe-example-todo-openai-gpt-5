import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppAdminAction } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppAdminAction";
import type { ITodoAppAdminAction } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAdminAction";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Validate that admin actions search rejects out-of-range pagination values.
 *
 * Business context:
 *
 * - Only authorized system admins can query administrative actions.
 * - The search endpoint enforces numeric constraints on pagination fields:
 *
 *   - Page: integer >= 1
 *   - Limit: integer in [1, 100] (maps scenario term "pageSize" → DTO field
 *       "limit").
 *
 * Test flow:
 *
 * 1. Register and authenticate a system admin (join), ensuring an authorized
 *    session.
 * 2. Perform a baseline valid call (page=1, limit=10) to ensure success under
 *    valid inputs.
 * 3. Call PATCH /todoApp/systemAdmin/adminActions with invalid limit values:
 *
 *    - Limit = 0 (below minimum)
 *    - Limit = 1000 (above maximum)
 *
 * Validations:
 *
 * - Use typia.assert() on successful auth and baseline search responses for
 *   complete type validation.
 * - For each invalid pagination request, assert that an error is thrown with
 *   await TestValidator.error(). Do not verify HTTP status codes or messages.
 */
export async function test_api_admin_action_search_invalid_pagination_validation_failure(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin via join
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 2) Baseline valid search (ensures endpoint works under valid inputs)
  const baseline = await api.functional.todoApp.systemAdmin.adminActions.index(
    connection,
    {
      body: {
        page: 1,
        limit: 10,
      } satisfies ITodoAppAdminAction.IRequest,
    },
  );
  typia.assert(baseline);

  // 3a) Invalid limit: below minimum (0)
  await TestValidator.error(
    "adminActions.index: limit below minimum (0) should fail",
    async () => {
      await api.functional.todoApp.systemAdmin.adminActions.index(connection, {
        body: {
          page: 1,
          limit: 0,
        } satisfies ITodoAppAdminAction.IRequest,
      });
    },
  );

  // 3b) Invalid limit: above maximum (1000)
  await TestValidator.error(
    "adminActions.index: limit above maximum (1000) should fail",
    async () => {
      await api.functional.todoApp.systemAdmin.adminActions.index(connection, {
        body: {
          page: 1,
          limit: 1000,
        } satisfies ITodoAppAdminAction.IRequest,
      });
    },
  );
}
