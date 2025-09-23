import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ETodoAppDataExportFormat } from "@ORGANIZATION/PROJECT-api/lib/structures/ETodoAppDataExportFormat";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppDataExport } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppDataExport";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Not-found detail of a personal data export job for an authenticated member.
 *
 * Purpose
 *
 * - Verify that an authenticated todoUser cannot fetch a data export job that
 *   does not exist (or does not belong to the user), and the server answers
 *   with an error without leaking any resource information.
 *
 * Why necessary
 *
 * - Privacy and ownership enforcement: users must not discover existence of
 *   others' export jobs and must receive a denial when requesting a random id.
 *
 * Steps
 *
 * 1. Authenticate a new todoUser by joining the service.
 * 2. Generate a well-formed random UUID for dataExportId that should not exist.
 * 3. Request the export job detail with that UUID and expect an error.
 */
export async function test_api_data_export_job_detail_not_found(
  connection: api.IConnection,
) {
  // 1) Authenticate a new member (todoUser)
  const auth = await api.functional.auth.todoUser.join(connection, {
    body: typia.random<ITodoAppTodoUser.ICreate>(),
  });
  typia.assert(auth);

  // 2) Generate a well-formed UUID that should not exist for this fresh user
  const missingId = typia.random<string & tags.Format<"uuid">>();

  // 3) Attempt to fetch the detail; expect an error (do not check status code)
  await TestValidator.error(
    "requesting non-existent data export id must fail",
    async () => {
      await api.functional.todoApp.todoUser.dataExports.at(connection, {
        dataExportId: missingId,
      });
    },
  );
}
