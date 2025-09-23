import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ETodoAppDataExportFormat } from "@ORGANIZATION/PROJECT-api/lib/structures/ETodoAppDataExportFormat";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppDataExport } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppDataExport";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_data_export_creation_unsupported_format_rejected(
  connection: api.IConnection,
) {
  /**
   * Validate data export creation with supported formats and enforce
   * auth/ownership rules.
   *
   * Scenario rewrite rationale:
   *
   * - The request body type for export creation
   *   (ITodoAppDataExport.ICreate.export_format) is restricted to
   *   ETodoAppDataExportFormat ("json" | "csv"). Therefore, testing an
   *   unsupported string (e.g., "xml") would require deliberate type errors,
   *   which are prohibited. Instead, we validate:
   *
   *   1. Successful creation with supported formats
   *   2. Unauthenticated request is rejected
   *   3. Cross-user (ownership) violation is rejected
   *
   * Steps:
   *
   * 1. Join user A (auth token auto-attached by SDK)
   * 2. Attempt unauthenticated creation for user A -> must fail
   * 3. Authenticated creation for user A with supported format -> must succeed
   * 4. Join user B (token switches to B)
   * 5. Attempt to create export for user A while authenticated as user B -> must
   *    fail
   * 6. Create export for user B (self) -> must succeed
   */
  // 1) Join user A
  const userA = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(userA);

  // 2) Unauthenticated attempt for user A -> should fail
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated request cannot create data export",
    async () => {
      await api.functional.todoApp.todoUser.users.dataExports.create(
        unauthConn,
        {
          userId: userA.id,
          body: {
            export_format: RandomGenerator.pick(["json", "csv"] as const),
          } satisfies ITodoAppDataExport.ICreate,
        },
      );
    },
  );

  // 3) Authenticated creation for user A -> success
  const formatA = RandomGenerator.pick(["json", "csv"] as const);
  const exportA =
    await api.functional.todoApp.todoUser.users.dataExports.create(connection, {
      userId: userA.id,
      body: { export_format: formatA } satisfies ITodoAppDataExport.ICreate,
    });
  typia.assert(exportA);
  TestValidator.equals(
    "export A format persisted",
    exportA.export_format,
    formatA,
  );

  // 4) Join user B (this switches the SDK auth context to user B)
  const userB = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(userB);

  // 5) Cross-user creation attempt (as B creating for A) -> should fail
  await TestValidator.error(
    "user cannot create export for another user",
    async () => {
      await api.functional.todoApp.todoUser.users.dataExports.create(
        connection,
        {
          userId: userA.id,
          body: {
            export_format: RandomGenerator.pick(["json", "csv"] as const),
          } satisfies ITodoAppDataExport.ICreate,
        },
      );
    },
  );

  // 6) Self creation for user B -> success
  const formatB = RandomGenerator.pick(["json", "csv"] as const);
  const exportB =
    await api.functional.todoApp.todoUser.users.dataExports.create(connection, {
      userId: userB.id,
      body: { export_format: formatB } satisfies ITodoAppDataExport.ICreate,
    });
  typia.assert(exportB);
  TestValidator.equals(
    "export B format persisted",
    exportB.export_format,
    formatB,
  );
}
