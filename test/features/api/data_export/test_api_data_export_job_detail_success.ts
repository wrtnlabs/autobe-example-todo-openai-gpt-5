import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ETodoAppDataExportFormat } from "@ORGANIZATION/PROJECT-api/lib/structures/ETodoAppDataExportFormat";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppDataExport } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppDataExport";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_data_export_job_detail_success(
  connection: api.IConnection,
) {
  /**
   * Validate that a todoUser can create a personal data export job and
   * immediately fetch its details by ID.
   *
   * Steps:
   *
   * 1. Register and authenticate a new todoUser (join)
   * 2. Create a data export job (users/{userId}/dataExports)
   * 3. Retrieve the job details by ID (dataExports/{dataExportId})
   * 4. Validate business expectations:
   *
   *    - IDs match between created and fetched records
   *    - Export_format persists
   *    - Status remains consistent between create and immediate read
   *    - Created_at remains identical
   *    - Download_uri and completed_at are null/undefined right after creation
   */

  // 1) Register and authenticate a new todoUser
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string & tags.MinLength<8> & tags.MaxLength<64> =
    typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>();

  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email,
        password,
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(authorized);

  // 2) Create a data export job for the authenticated user
  const format: ETodoAppDataExportFormat = RandomGenerator.pick([
    "json",
    "csv",
  ] as const);

  const created: ITodoAppDataExport =
    await api.functional.todoApp.todoUser.users.dataExports.create(connection, {
      userId: authorized.id,
      body: {
        export_format: format,
      } satisfies ITodoAppDataExport.ICreate,
    });
  typia.assert(created);

  // 3) Retrieve the job details by ID
  const fetched: ITodoAppDataExport =
    await api.functional.todoApp.todoUser.dataExports.at(connection, {
      dataExportId: created.id,
    });
  typia.assert(fetched);

  // 4) Business validations
  TestValidator.equals(
    "created and fetched export IDs must match",
    fetched.id,
    created.id,
  );
  TestValidator.equals(
    "export_format must persist from creation to fetch",
    fetched.export_format,
    format,
  );
  TestValidator.equals(
    "status should remain consistent on immediate fetch",
    fetched.status,
    created.status,
  );
  TestValidator.equals(
    "created_at remains identical between create and fetch",
    fetched.created_at,
    created.created_at,
  );
  TestValidator.predicate(
    "download_uri should be null or undefined before completion",
    fetched.download_uri === null || fetched.download_uri === undefined,
  );
  TestValidator.predicate(
    "completed_at should be null or undefined before completion",
    fetched.completed_at === null || fetched.completed_at === undefined,
  );
}
