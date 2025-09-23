import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ETodoAppDataExportFormat } from "@ORGANIZATION/PROJECT-api/lib/structures/ETodoAppDataExportFormat";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppDataExport } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppDataExport";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Verify cross-user access to data export detail is denied.
 *
 * Business goal:
 *
 * - Ensure a todoUser cannot read another user's personal data export job even
 *   when providing the correct userId and dataExportId. This protects privacy
 *   boundaries and avoids leaking existence of other users' resources.
 *
 * Workflow:
 *
 * 1. Join User A (auth token becomes A)
 * 2. Join User B (auth token becomes B)
 * 3. As B, create a data export job and capture its id
 * 4. As B, GET the export detail successfully (baseline verification)
 * 5. Switch auth to a different user (join a new User A2)
 * 6. As A2, attempt to GET B's export detail → expect error (denied)
 */
export async function test_api_data_export_detail_cross_user_access_denied(
  connection: api.IConnection,
) {
  // 1) Join User A (store only the id; token becomes A implicitly)
  const joinABody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const userA: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinABody });
  typia.assert(userA);

  // 2) Join User B (token becomes B implicitly)
  const joinBBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const userB: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBBody });
  typia.assert(userB);

  // 3) As B, create a data export job for B
  const createExportBody = {
    export_format: typia.random<ETodoAppDataExportFormat>(),
  } satisfies ITodoAppDataExport.ICreate;
  const exportB: ITodoAppDataExport =
    await api.functional.todoApp.todoUser.users.dataExports.create(connection, {
      userId: userB.id,
      body: createExportBody,
    });
  typia.assert(exportB);
  TestValidator.equals(
    "created export format matches request",
    exportB.export_format,
    createExportBody.export_format,
  );

  // 4) As B, baseline GET should succeed
  const fetchedByB: ITodoAppDataExport =
    await api.functional.todoApp.todoUser.users.dataExports.at(connection, {
      userId: userB.id,
      dataExportId: exportB.id,
    });
  typia.assert(fetchedByB);
  TestValidator.equals(
    "export id fetched by owner matches",
    fetchedByB.id,
    exportB.id,
  );

  // 5) Switch auth to a different user (join A2)
  const joinA2Body = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const userA2: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinA2Body });
  typia.assert(userA2);

  // 6) As A2, attempt to access B's export detail → expect error
  await TestValidator.error(
    "cross-user access to another user's data export must be denied",
    async () => {
      await api.functional.todoApp.todoUser.users.dataExports.at(connection, {
        userId: userB.id,
        dataExportId: exportB.id,
      });
    },
  );
}
