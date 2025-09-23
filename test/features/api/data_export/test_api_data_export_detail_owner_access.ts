import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ETodoAppDataExportFormat } from "@ORGANIZATION/PROJECT-api/lib/structures/ETodoAppDataExportFormat";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppDataExport } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppDataExport";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Verify owner-only access to data export detail.
 *
 * This test ensures that an authenticated todoUser can:
 *
 * 1. Register (join) and obtain authentication context
 * 2. Create a personal data export job in a chosen format (json/csv)
 * 3. Retrieve the export job detail by its ID as the owner
 *
 * It also validates that another authenticated user cannot read the first
 * user's export job (cross-user access is blocked by ownership checks).
 *
 * Steps
 *
 * 1. Join as owner and capture ownerId
 * 2. Create data export job (capture dataExportId)
 * 3. GET detail as owner and validate business fields
 * 4. Join as another user and verify cross-user GET is rejected
 */
export async function test_api_data_export_detail_owner_access(
  connection: api.IConnection,
) {
  // 1) Register (join) owner user
  const ownerAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: typia.random<
          string & tags.MinLength<8> & tags.MaxLength<64>
        >(),
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(ownerAuth);
  const ownerId = ownerAuth.id; // uuid

  // 2) Create a new data export job for the owner
  const formatOptions = ["json", "csv"] as const;
  const exportFormat = RandomGenerator.pick(formatOptions);

  const created: ITodoAppDataExport =
    await api.functional.todoApp.todoUser.users.dataExports.create(connection, {
      userId: ownerId,
      body: {
        export_format: exportFormat,
      } satisfies ITodoAppDataExport.ICreate,
    });
  typia.assert(created);

  // 3) Retrieve the data export job detail as the owner
  const detail: ITodoAppDataExport =
    await api.functional.todoApp.todoUser.users.dataExports.at(connection, {
      userId: ownerId,
      dataExportId: created.id,
    });
  typia.assert(detail);

  // 4) Business validations (no type checks beyond typia.assert)
  TestValidator.equals(
    "detail id should equal created id",
    detail.id,
    created.id,
  );
  TestValidator.equals(
    "detail export_format should equal requested",
    detail.export_format,
    exportFormat,
  );
  TestValidator.equals(
    "detail status should equal created status",
    detail.status,
    created.status,
  );
  TestValidator.equals(
    "detail created_at should equal created created_at",
    detail.created_at,
    created.created_at,
  );

  // 5) Cross-user access must be blocked
  const intruderAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: typia.random<
          string & tags.MinLength<8> & tags.MaxLength<64>
        >(),
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(intruderAuth);

  await TestValidator.error(
    "non-owner cannot access another user's data export detail",
    async () => {
      await api.functional.todoApp.todoUser.users.dataExports.at(connection, {
        userId: intruderAuth.id,
        dataExportId: created.id,
      });
    },
  );
}
