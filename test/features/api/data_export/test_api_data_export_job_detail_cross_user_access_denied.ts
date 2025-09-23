import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ETodoAppDataExportFormat } from "@ORGANIZATION/PROJECT-api/lib/structures/ETodoAppDataExportFormat";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppDataExport } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppDataExport";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Cross-user access must be denied for personal data export details.
 *
 * Scenario:
 *
 * 1. Member A joins (auth token is set by SDK)
 * 2. Member A creates an export job and obtains its id
 * 3. (Owner positive control) Member A reads the export successfully and the ids
 *    match
 * 4. Member B joins (auth context switches to Member B)
 * 5. Member B attempts to read Member A's export job and an error is thrown
 *
 * Constraints and rules:
 *
 * - Do not assert specific HTTP status codes; only validate that an error occurs
 * - Never manipulate connection.headers directly; SDK handles auth tokens
 * - Use correct DTO variants: ICreate for joins and export creation; detail GET
 *   returns entity
 */
export async function test_api_data_export_job_detail_cross_user_access_denied(
  connection: api.IConnection,
) {
  // 1) Member A joins
  const emailA: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const passwordA: string = RandomGenerator.alphaNumeric(12);
  const memberA: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email: emailA,
        password: passwordA,
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(memberA);

  // 2) Member A creates an export job
  const createBody = {
    export_format: typia.random<ETodoAppDataExportFormat>(),
  } satisfies ITodoAppDataExport.ICreate;
  const exportA: ITodoAppDataExport =
    await api.functional.todoApp.todoUser.users.dataExports.create(connection, {
      userId: memberA.id,
      body: createBody,
    });
  typia.assert(exportA);

  // 3) Owner positive control: Member A can read own export
  const exportOwnerCheck: ITodoAppDataExport =
    await api.functional.todoApp.todoUser.dataExports.at(connection, {
      dataExportId: exportA.id,
    });
  typia.assert(exportOwnerCheck);
  TestValidator.equals(
    "owner can access own export by id",
    exportOwnerCheck.id,
    exportA.id,
  );

  // 4) Member B joins (switch auth context)
  const emailB: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const passwordB: string = RandomGenerator.alphaNumeric(12);
  const memberB: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email: emailB,
        password: passwordB,
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(memberB);

  // 5) Cross-user access must be denied (Member B attempts to read Member A's export)
  await TestValidator.error(
    "cross-user access is denied when fetching another user's export",
    async () => {
      await api.functional.todoApp.todoUser.dataExports.at(connection, {
        dataExportId: exportA.id,
      });
    },
  );
}
