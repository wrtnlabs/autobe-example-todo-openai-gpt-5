import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppSystemAdmin";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Verify that a non-admin (todoUser) cannot read a systemAdmin role assignment
 * detail.
 *
 * Business context:
 *
 * - SystemAdmin assignment detail is an administrative audit resource and must
 *   not be exposed to regular members.
 * - SDK automatically manages authentication tokens upon join calls.
 *
 * Steps:
 *
 * 1. Register a system administrator (sets Authorization to admin token)
 * 2. List the admin's systemAdmin role assignments to obtain a valid systemAdminId
 * 3. Register a regular todoUser (switches Authorization to member token)
 * 4. Attempt to read the systemAdmin assignment detail with the member token →
 *    expect an error (authorization failure)
 *
 * Notes:
 *
 * - Use typia.assert for all non-void responses (complete type validation)
 * - Use TestValidator.error for the forbidden access check; do not assert
 *   specific HTTP status codes
 */
export async function test_api_system_admin_role_assignment_detail_forbidden_for_member(
  connection: api.IConnection,
) {
  // 1) Register a system administrator
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: typia.random<ITodoAppSystemAdminJoin.ICreate>(),
    });
  typia.assert(adminAuth);

  // 2) List the admin's systemAdmin role assignments to obtain a valid systemAdminId
  const page: IPageITodoAppSystemAdmin.ISummary =
    await api.functional.todoApp.systemAdmin.users.systemAdmins.index(
      connection,
      {
        userId: adminAuth.id,
        body: {} satisfies ITodoAppSystemAdmin.IRequest,
      },
    );
  typia.assert(page);
  TestValidator.predicate(
    "admin must have at least one systemAdmin role assignment",
    page.data.length > 0,
  );
  const assignment = typia.assert<ITodoAppSystemAdmin.ISummary>(page.data[0]!);

  // 3) Register a regular todoUser (this switches Authorization to member token)
  const memberAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: typia.random<ITodoAppTodoUser.ICreate>(),
    });
  typia.assert(memberAuth);

  // 4) Attempt forbidden access as member: expect an error (no status code assertion)
  await TestValidator.error(
    "member must not access systemAdmin assignment detail",
    async () => {
      await api.functional.todoApp.systemAdmin.users.systemAdmins.at(
        connection,
        {
          userId: adminAuth.id,
          systemAdminId: assignment.id,
        },
      );
    },
  );
}
