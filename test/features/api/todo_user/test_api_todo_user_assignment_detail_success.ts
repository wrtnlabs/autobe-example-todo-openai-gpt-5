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
 * Validate that a system administrator can fetch a specific todoUser
 * role-assignment detail for a user.
 *
 * Business flow:
 *
 * 1. Create a todoUser account (join) to generate an assignment row (revoked_at
 *    null).
 * 2. Join as systemAdmin to gain admin privileges (token switches automatically).
 * 3. List the user's assignment history (PATCH index) with sorting to get the most
 *    recent assignment ID.
 * 4. Fetch detail (GET at) by {userId, todoUserId} and validate relationships and
 *    integrity.
 */
export async function test_api_todo_user_assignment_detail_success(
  connection: api.IConnection,
) {
  // 1) Create a todoUser member (this will create an active assignment row)
  const todoUserAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: typia.random<
          string & tags.MinLength<8> & tags.MaxLength<64>
        >(),
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(todoUserAuth);

  const userId: string & tags.Format<"uuid"> = todoUserAuth.id;

  // 2) Authenticate as systemAdmin to access governance endpoints
  const sysAdminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: typia.random<
          string & tags.MinLength<8> & tags.MaxLength<64>
        >(),
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(sysAdminAuth);

  // 3) List the todoUser assignment history for the created user
  const page: IPageITodoAppTodoUser.ISummary =
    await api.functional.todoApp.systemAdmin.users.todoUsers.index(connection, {
      userId,
      body: {
        page: 1,
        limit: 10,
        sort: "granted_at",
        direction: "desc",
        activeOnly: true,
      } satisfies ITodoAppTodoUser.IRequest,
    });
  typia.assert(page);

  // Ensure we have at least one assignment record
  TestValidator.predicate(
    "assignment list should contain at least one record",
    page.data.length > 0,
  );

  // Choose the first (most recent) assignment
  const summary: ITodoAppTodoUser.ISummary = page.data[0];
  TestValidator.equals(
    "summary.todo_app_user_id should match created userId",
    summary.todo_app_user_id,
    userId,
  );

  // 4) Fetch detail by (userId, todoUserId)
  const detail: ITodoAppTodoUser =
    await api.functional.todoApp.systemAdmin.users.todoUsers.at(connection, {
      userId,
      todoUserId: summary.id,
    });
  typia.assert(detail);

  // Validate relationships and identity
  TestValidator.equals(
    "detail.id should equal summary.id",
    detail.id,
    summary.id,
  );
  TestValidator.equals(
    "detail.todo_app_user_id should equal created userId",
    detail.todo_app_user_id,
    userId,
  );

  // If activeOnly was true, the chosen summary should represent an active assignment
  TestValidator.equals(
    "summary.revoked_at should be null or undefined for active assignment",
    summary.revoked_at ?? null,
    null,
  );
}
