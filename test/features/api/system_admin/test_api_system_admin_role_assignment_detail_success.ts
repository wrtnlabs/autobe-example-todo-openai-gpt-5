import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppSystemAdmin";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Retrieve own systemAdmin role assignment detail (happy path).
 *
 * Business flow:
 *
 * 1. Register (join) a new system administrator to create a user and active role
 *    assignment.
 * 2. List the user’s systemAdmin role assignments (activeOnly) and take one
 *    assignment id.
 * 3. Get the detailed assignment by id and validate ownership and active state.
 */
export async function test_api_system_admin_role_assignment_detail_success(
  connection: api.IConnection,
) {
  // 1) Join as a new system administrator (creates user + active role grant)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const authorized: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);
  const userId = authorized.id; // owner user id for subsequent requests

  // 2) List role assignment history for this user and pick an active record
  const listRequest = {
    page: typia.random<number & tags.Type<"int32"> & tags.Minimum<1>>(),
    limit: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<1> & tags.Maximum<100>
    >(),
    sort: "granted_at",
    direction: "desc",
    activeOnly: true,
  } satisfies ITodoAppSystemAdmin.IRequest;
  const page: IPageITodoAppSystemAdmin.ISummary =
    await api.functional.todoApp.systemAdmin.users.systemAdmins.index(
      connection,
      {
        userId,
        body: listRequest,
      },
    );
  typia.assert(page);
  TestValidator.predicate(
    "at least one systemAdmin assignment exists for the joined admin",
    page.data.length > 0,
  );
  const summary = typia.assert<ITodoAppSystemAdmin.ISummary>(page.data[0]!);

  // 3) Retrieve detail by id and validate invariants
  const detail: ITodoAppSystemAdmin =
    await api.functional.todoApp.systemAdmin.users.systemAdmins.at(connection, {
      userId,
      systemAdminId: summary.id,
    });
  typia.assert(detail);

  // Ownership and identity
  TestValidator.equals(
    "detail id matches the assignment selected from index",
    detail.id,
    summary.id,
  );
  TestValidator.equals(
    "detail todo_app_user_id equals the authenticated admin's userId",
    detail.todo_app_user_id,
    userId,
  );

  // Active assignment state: revoked_at must be null
  TestValidator.equals(
    "active assignment revoked_at is null",
    detail.revoked_at,
    null,
  );
}
