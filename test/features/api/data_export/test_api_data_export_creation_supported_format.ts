import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ETodoAppDataExportFormat } from "@ORGANIZATION/PROJECT-api/lib/structures/ETodoAppDataExportFormat";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppDataExport } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppDataExport";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Validate creation of a personal data export job with a supported format.
 *
 * Flow:
 *
 * 1. Register a new todoUser (join) and capture the authenticated user id
 * 2. Create a data export job for that user with a supported export_format
 * 3. Validate server-managed fields are initially unset and export_format echoes
 *    input
 * 4. Create a second export job immediately to ensure duplicate submissions are
 *    allowed
 */
export async function test_api_data_export_creation_supported_format(
  connection: api.IConnection,
) {
  // 1) Authenticate (join) a new todoUser
  const joinBody = typia.random<ITodoAppTodoUser.ICreate>();
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);

  // 2) Create a data export with a supported format
  const chosenFormat = typia.random<ETodoAppDataExportFormat>(); // "json" | "csv"
  const createBody = {
    export_format: chosenFormat,
  } satisfies ITodoAppDataExport.ICreate;

  const created =
    await api.functional.todoApp.todoUser.users.dataExports.create(connection, {
      userId: authorized.id,
      body: createBody,
    });
  typia.assert(created);

  // 3) Validate initial state and echo of input
  TestValidator.equals(
    "export_format should echo requested value",
    created.export_format,
    chosenFormat,
  );
  TestValidator.predicate(
    "download_uri should not exist at creation time",
    created.download_uri === null || created.download_uri === undefined,
  );
  TestValidator.predicate(
    "file_size_bytes should not exist at creation time",
    created.file_size_bytes === null || created.file_size_bytes === undefined,
  );
  TestValidator.predicate(
    "checksum should not exist at creation time",
    created.checksum === null || created.checksum === undefined,
  );
  TestValidator.predicate(
    "completed_at should not exist at creation time",
    created.completed_at === null || created.completed_at === undefined,
  );
  TestValidator.predicate(
    "expires_at should not exist at creation time",
    created.expires_at === null || created.expires_at === undefined,
  );
  TestValidator.notEquals(
    "status should not be 'completed' immediately",
    created.status,
    "completed",
  );
  TestValidator.notEquals(
    "status should not be 'failed' immediately",
    created.status,
    "failed",
  );

  // 4) Duplicate submission: create another export with the same format
  const createBody2 = {
    export_format: chosenFormat,
  } satisfies ITodoAppDataExport.ICreate;
  const created2 =
    await api.functional.todoApp.todoUser.users.dataExports.create(connection, {
      userId: authorized.id,
      body: createBody2,
    });
  typia.assert(created2);

  TestValidator.notEquals(
    "duplicate submissions should create distinct export jobs (ids differ)",
    created2.id,
    created.id,
  );
}
