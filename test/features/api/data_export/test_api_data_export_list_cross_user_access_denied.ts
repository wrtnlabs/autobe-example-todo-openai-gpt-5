import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ETodoAppDataExportFormat } from "@ORGANIZATION/PROJECT-api/lib/structures/ETodoAppDataExportFormat";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppDataExport } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppDataExport";
import type { ITodoAppDataExport } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppDataExport";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Access control: cross-user listing of data export jobs must be denied.
 *
 * Business context:
 *
 * - Personal data export jobs are private to the owning todoUser. Even if another
 *   user can guess the owner's userId, the API must enforce owner-only access
 *   and avoid leaking whether records exist.
 *
 * Steps:
 *
 * 1. Create isolated SDK connections for User A and User B.
 * 2. Join (register + authenticate) User A and User B separately.
 * 3. Under User B, create an export job (optional setup, strengthens the case).
 * 4. Using User A's connection, attempt to list User B's exports: expect denial
 *    (error).
 * 5. Sanity check: Using User B's connection, list B's own exports successfully.
 */
export async function test_api_data_export_list_cross_user_access_denied(
  connection: api.IConnection,
) {
  // Prepare isolated connections to keep tokens separated and SDK-managed
  const connA: api.IConnection = { ...connection, headers: {} };
  const connB: api.IConnection = { ...connection, headers: {} };

  // 1) Register User A
  const authA: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connA, {
      body: typia.random<ITodoAppTodoUser.ICreate>(),
    });
  typia.assert(authA);

  // 2) Register User B
  const authB: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connB, {
      body: typia.random<ITodoAppTodoUser.ICreate>(),
    });
  typia.assert(authB);

  // 3) Optional setup: create an export job for User B
  const createBodyB = {
    export_format: RandomGenerator.pick(["json", "csv"] as const),
  } satisfies ITodoAppDataExport.ICreate;
  const exportJobB: ITodoAppDataExport =
    await api.functional.todoApp.todoUser.users.dataExports.create(connB, {
      userId: authB.id,
      body: createBodyB,
    });
  typia.assert(exportJobB);

  // 4) Using User A's context, attempt to list User B's exports -> must be denied
  await TestValidator.error(
    "todoUser A cannot list data exports that belong to todoUser B",
    async () => {
      await api.functional.todoApp.todoUser.users.dataExports.index(connA, {
        userId: authB.id,
        body: {} satisfies ITodoAppDataExport.IRequest,
      });
    },
  );

  // 5) Sanity check: User B lists their own exports successfully
  const pageB: IPageITodoAppDataExport.ISummary =
    await api.functional.todoApp.todoUser.users.dataExports.index(connB, {
      userId: authB.id,
      body: { page: 1, limit: 10 } satisfies ITodoAppDataExport.IRequest,
    });
  typia.assert(pageB);
}
