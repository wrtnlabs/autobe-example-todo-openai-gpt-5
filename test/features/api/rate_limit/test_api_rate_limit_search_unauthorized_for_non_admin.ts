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
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Ensure non-admin users cannot search administrative rate limit policies and
 * that unauthenticated requests are also rejected.
 *
 * Business rationale:
 *
 * - Rate limit configurations are administrative and must not be visible to
 *   ordinary todo users.
 * - This test verifies that the systemAdmin listing endpoint rejects:
 *
 *   1. An authenticated non-admin (todoUser), and
 *   2. An unauthenticated request (no token).
 *
 * Steps:
 *
 * 1. Register (join) as a regular todoUser to get an authenticated session.
 * 2. Attempt PATCH /todoApp/systemAdmin/rateLimits as that non-admin user and
 *    assert an error is thrown.
 * 3. Construct an unauthenticated connection and attempt again, asserting an error
 *    is thrown.
 *
 * DTO mapping:
 *
 * - Join: ITodoAppTodoUser.ICreate -> ITodoAppTodoUser.IAuthorized
 * - Rate limit search: ITodoAppRateLimit.IRequest (request body)
 */
export async function test_api_rate_limit_search_unauthorized_for_non_admin(
  connection: api.IConnection,
) {
  // 1) Register a regular todoUser (non-admin)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;

  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);

  // Common request body for listing (explicit nulls; benign search)
  const searchBody = {
    page: null,
    limit: null,
    search: null,
    scope: null,
    category: null,
    enabled: null,
    sliding_window: null,
    window_seconds_min: null,
    window_seconds_max: null,
    max_requests_min: null,
    max_requests_max: null,
  } satisfies ITodoAppRateLimit.IRequest;

  // 2) Non-admin (todoUser) must not access the admin listing
  await TestValidator.error(
    "non-admin user cannot access systemAdmin rate limit listing",
    async () => {
      await api.functional.todoApp.systemAdmin.rateLimits.index(connection, {
        body: searchBody,
      });
    },
  );

  // 3) Unauthenticated request must also be rejected
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated request cannot access systemAdmin rate limit listing",
    async () => {
      await api.functional.todoApp.systemAdmin.rateLimits.index(unauthConn, {
        body: searchBody,
      });
    },
  );
}
