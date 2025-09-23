import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppTodoUser";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Verify unauthorized access is rejected for todoUser assignment detail
 * endpoint.
 *
 * This test ensures that GET
 * /todoApp/systemAdmin/users/{userId}/todoUsers/{todoUserId} cannot be accessed
 * by unauthenticated callers or by authenticated non-admin users.
 *
 * Business flow:
 *
 * 1. Prepare three independent connections: adminConn, userConn, unauthConn.
 *
 *    - UnauthConn: explicitly has empty headers (no Authorization).
 *    - AdminConn: will be authenticated as system admin.
 *    - UserConn: will be authenticated as todoUser.
 * 2. Register a system admin using adminConn.
 * 3. Register a todoUser using userConn; capture its user id.
 * 4. Using adminConn, list the todoUser's role assignments (index) and pick one
 *    assignment id.
 * 5. Try to GET the assignment detail (at) without Authorization (unauthConn) →
 *    expect error.
 * 6. Try to GET the assignment detail (at) with todoUser token (userConn) → expect
 *    error.
 *
 * Notes:
 *
 * - Do not validate status codes; only ensure an error occurs.
 * - Use typia.assert on successful responses.
 */
export async function test_api_todo_user_assignment_detail_unauthorized(
  connection: api.IConnection,
) {
  // 1) Prepare isolated connections (do not touch headers after creation)
  const adminConn: api.IConnection = { ...connection, headers: {} };
  const userConn: api.IConnection = { ...connection, headers: {} };
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 2) Register a system admin
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(adminConn, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(adminAuth);

  // 3) Register a todoUser
  const userAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(userConn, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(userAuth);
  const userId = userAuth.id; // todo_app_users.id of the created todoUser

  // 4) As admin, list role assignments to obtain an assignment id
  const listReq = {
    page: 1,
    limit: 10,
    activeOnly: true,
  } satisfies ITodoAppTodoUser.IRequest;
  const page: IPageITodoAppTodoUser.ISummary =
    await api.functional.todoApp.systemAdmin.users.todoUsers.index(adminConn, {
      userId,
      body: listReq,
    });
  typia.assert(page);

  // Ensure we have at least one assignment
  await TestValidator.predicate(
    "role assignments must contain at least one record",
    async () => page.data.length > 0,
  );
  const first = page.data[0];
  // Sanity check: the assignment belongs to the created user
  TestValidator.equals(
    "assignment owner must match created user",
    first.todo_app_user_id,
    userId,
  );

  const todoUserId = first.id; // assignment record id

  // 5) Unauthenticated call must fail
  await TestValidator.error(
    "unauthenticated detail request must be rejected",
    async () => {
      await api.functional.todoApp.systemAdmin.users.todoUsers.at(unauthConn, {
        userId,
        todoUserId,
      });
    },
  );

  // 6) Non-admin (todoUser) call must fail
  await TestValidator.error(
    "non-admin detail request must be rejected",
    async () => {
      await api.functional.todoApp.systemAdmin.users.todoUsers.at(userConn, {
        userId,
        todoUserId,
      });
    },
  );
}
