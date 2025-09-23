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
 * Ensure not-found style response on cross-user access to a systemAdmin role
 * assignment.
 *
 * Business flow:
 *
 * 1. Register Admin A
 * 2. Register Admin B
 * 3. List Admin B's systemAdmin assignments and capture an assignment id
 * 4. Sanity check: GET detail for Admin B using the captured id (must succeed)
 * 5. Mismatch: GET detail using Admin A's userId with Admin B's assignment id
 *    (must error)
 */
export async function test_api_system_admin_role_assignment_detail_user_mismatch_not_found(
  connection: api.IConnection,
) {
  // 1) Register Admin A
  const adminA = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(adminA);

  // 2) Register Admin B (connection token switches automatically)
  const adminB = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(adminB);

  // 3) List Admin B assignments to obtain a real systemAdminId
  const pageB =
    await api.functional.todoApp.systemAdmin.users.systemAdmins.index(
      connection,
      {
        userId: adminB.id,
        body: {
          page: 1,
          limit: 10,
          activeOnly: true,
        } satisfies ITodoAppSystemAdmin.IRequest,
      },
    );
  typia.assert(pageB);

  // Ensure page contains at least one assignment for Admin B
  TestValidator.predicate(
    "admin B assignments should not be empty after join",
    pageB.data.length > 0,
  );

  // Verify scoping: every returned summary belongs to adminB.id
  for (const sum of pageB.data) {
    TestValidator.equals(
      "each summary belongs to adminB",
      sum.todo_app_user_id,
      adminB.id,
    );
  }

  const systemAdminId_B = pageB.data[0]!.id;

  // 4) Positive control: detail fetch with matching userId (Admin B)
  const detailB =
    await api.functional.todoApp.systemAdmin.users.systemAdmins.at(connection, {
      userId: adminB.id,
      systemAdminId: systemAdminId_B,
    });
  typia.assert(detailB);
  TestValidator.equals(
    "detailB.todo_app_user_id should equal adminB.id",
    detailB.todo_app_user_id,
    adminB.id,
  );

  // 5) Mismatch: try to read Admin B's assignment using Admin A's userId → should error (not-found semantics)
  await TestValidator.error(
    "mismatched userId-systemAdminId must not be readable",
    async () => {
      await api.functional.todoApp.systemAdmin.users.systemAdmins.at(
        connection,
        {
          userId: adminA.id, // mismatched owner
          systemAdminId: systemAdminId_B, // belongs to Admin B
        },
      );
    },
  );
}
