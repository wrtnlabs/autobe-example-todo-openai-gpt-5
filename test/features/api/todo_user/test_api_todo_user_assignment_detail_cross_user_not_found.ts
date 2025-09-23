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
 * Cross-user scoping validation for todoUser assignment detail.
 *
 * Business goal: Ensure that requesting a todoUser assignment record with a
 * mismatched owner scope does not leak data and results in an error (e.g.,
 * not-found/forbidden), while the rightful owner scope succeeds.
 *
 * Steps:
 *
 * 1. Join as systemAdmin for administrative access.
 * 2. Join two distinct todoUsers A and B.
 * 3. Re-join as systemAdmin (SDK switches tokens on join calls).
 * 4. List B's assignments to obtain an assignment id (fallback to A, then random
 *    UUID if needed).
 * 5. Positive control: Read detail with matching owner id (if we acquired a real
 *    id from listing) and validate ownership.
 * 6. Negative: Attempt to read the same assignment using the other user's id as
 *    the path owner; expect error without leakage.
 */
export async function test_api_todo_user_assignment_detail_cross_user_not_found(
  connection: api.IConnection,
) {
  // 1) Join as systemAdmin
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin1: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: adminJoinBody,
    });
  typia.assert(admin1);

  // 2) Join two todoUsers A and B
  const todoAJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const userA: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: todoAJoinBody,
    });
  typia.assert(userA);

  const todoBJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const userB: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: todoBJoinBody,
    });
  typia.assert(userB);

  // Sanity: distinct users
  TestValidator.notEquals(
    "created users A and B must be distinct",
    userA.id,
    userB.id,
  );

  // 3) Re-authenticate as systemAdmin to use governance endpoints
  const admin2JoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin2: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: admin2JoinBody,
    });
  typia.assert(admin2);

  // 4) List B's assignments to get a valid todoUser assignment id (fallbacks included)
  const listReq = {} satisfies ITodoAppTodoUser.IRequest;
  const pageB: IPageITodoAppTodoUser.ISummary =
    await api.functional.todoApp.systemAdmin.users.todoUsers.index(connection, {
      userId: userB.id,
      body: listReq,
    });
  typia.assert(pageB);

  let targetTodoUserId: string & tags.Format<"uuid">;
  let ownerUserIdForSuccess: (string & tags.Format<"uuid">) | null = null;
  if (pageB.data.length > 0) {
    targetTodoUserId = pageB.data[0].id;
    ownerUserIdForSuccess = userB.id;
  } else {
    const pageA: IPageITodoAppTodoUser.ISummary =
      await api.functional.todoApp.systemAdmin.users.todoUsers.index(
        connection,
        {
          userId: userA.id,
          body: listReq,
        },
      );
    typia.assert(pageA);

    if (pageA.data.length > 0) {
      targetTodoUserId = pageA.data[0].id;
      ownerUserIdForSuccess = userA.id;
    } else {
      // Defensive fallback under simulated/random environments
      targetTodoUserId = typia.random<string & tags.Format<"uuid">>();
      ownerUserIdForSuccess = null; // no positive control possible
    }
  }

  // 5) Positive control: when we got a real id from list, verify matching scope succeeds
  if (ownerUserIdForSuccess !== null) {
    const detail: ITodoAppTodoUser =
      await api.functional.todoApp.systemAdmin.users.todoUsers.at(connection, {
        userId: ownerUserIdForSuccess,
        todoUserId: targetTodoUserId,
      });
    typia.assert(detail);
    TestValidator.equals(
      "detail owner must match path userId",
      detail.todo_app_user_id,
      ownerUserIdForSuccess,
    );
  }

  // Determine mismatched owner id for the negative test
  const mismatchedOwner: string & tags.Format<"uuid"> =
    ownerUserIdForSuccess === userA.id ? userB.id : userA.id;

  // 6) Negative case: cross-user mismatch must error without leakage
  await TestValidator.error(
    "cross-user scoped detail must be inaccessible",
    async () => {
      await api.functional.todoApp.systemAdmin.users.todoUsers.at(connection, {
        userId: mismatchedOwner,
        todoUserId: targetTodoUserId,
      });
    },
  );
}
