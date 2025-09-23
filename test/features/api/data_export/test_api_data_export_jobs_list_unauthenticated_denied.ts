import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ETodoAppDataExportFormat } from "@ORGANIZATION/PROJECT-api/lib/structures/ETodoAppDataExportFormat";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppDataExport } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppDataExport";
import type { ITodoAppDataExport } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppDataExport";

export async function test_api_data_export_jobs_list_unauthenticated_denied(
  connection: api.IConnection,
) {
  /**
   * Ensure listing personal data export jobs requires authentication.
   *
   * Steps:
   *
   * 1. Build an unauthenticated connection by cloning the given connection and
   *    setting empty headers.
   * 2. Call PATCH /todoApp/todoUser/dataExports with a minimal valid request body.
   * 3. Verify the call fails (error is thrown), proving auth is required and no
   *    data is leaked.
   */
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  const requestBody = {
    // All fields are optional. Minimal valid search body.
  } satisfies ITodoAppDataExport.IRequest;

  await TestValidator.error(
    "unauthenticated user cannot list data export jobs",
    async () => {
      await api.functional.todoApp.todoUser.dataExports.index(unauthConn, {
        body: requestBody,
      });
    },
  );
}
