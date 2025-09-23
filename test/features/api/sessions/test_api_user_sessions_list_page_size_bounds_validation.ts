import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppSession } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppSession";
import type { ITodoAppSession } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSession";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppTodoUserLogin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserLogin";

/**
 * Validate server-side page-size bounds for listing todoUser sessions.
 *
 * Scenario:
 *
 * 1. Create a todoUser account (join) with a valid email/password and gain an
 *    authenticated context.
 * 2. Optionally login again to ensure there are multiple sessions for realism.
 * 3. Call PATCH /todoApp/todoUser/users/{userId}/sessions with oversized limits
 *    (e.g., 1000 and 101), and verify that the server rejects the request
 *    (runtime business validation), using TestValidator.error with async
 *    callbacks (await required).
 * 4. Call the same endpoint with a boundary-valid limit (100) to ensure success
 *    and that returned data page does not exceed the limit.
 *
 * Notes:
 *
 * - Use `satisfies` for all request body DTOs.
 * - Use typia.assert on all non-void responses for type guarantees.
 * - Never touch connection.headers; auth tokens are auto-managed by the SDK.
 */
export async function test_api_user_sessions_list_page_size_bounds_validation(
  connection: api.IConnection,
) {
  // 1) Create a member via join (establish authenticated context)
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12); // 8–64 chars policy

  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: {
      email,
      password,
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authorized);

  // 2) Optional: create an additional session for realism (more sessions to list)
  const relogin = await api.functional.auth.todoUser.login(connection, {
    body: {
      email,
      password,
    } satisfies ITodoAppTodoUserLogin.IRequest,
  });
  typia.assert(relogin);

  // 3) Error path: oversize page sizes beyond allowed bounds (100 is max)
  await TestValidator.error(
    "reject oversized page size: limit=1000 (must be <= 100)",
    async () => {
      await api.functional.todoApp.todoUser.users.sessions.index(connection, {
        userId: authorized.id,
        body: {
          limit: 1000,
        } satisfies ITodoAppSession.IRequest,
      });
    },
  );

  await TestValidator.error(
    "reject just-over-boundary page size: limit=101 (must be <= 100)",
    async () => {
      await api.functional.todoApp.todoUser.users.sessions.index(connection, {
        userId: authorized.id,
        body: {
          limit: 101,
        } satisfies ITodoAppSession.IRequest,
      });
    },
  );

  // 4) Success path: valid boundary value (limit=100)
  const page = await api.functional.todoApp.todoUser.users.sessions.index(
    connection,
    {
      userId: authorized.id,
      body: {
        limit: 100,
      } satisfies ITodoAppSession.IRequest,
    },
  );
  typia.assert(page);

  // Basic business validation: result size should not exceed pagination.limit
  TestValidator.predicate(
    "returned data length must not exceed pagination.limit",
    page.data.length <= page.pagination.limit,
  );
}
