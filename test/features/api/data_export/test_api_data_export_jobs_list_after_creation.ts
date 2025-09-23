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
 * List todo user's personal data export jobs after creating two exports.
 *
 * Business context:
 *
 * - A todoUser can initiate personal data export jobs in various formats.
 * - Newly created jobs start in an initial lifecycle state (e.g., "requested")
 *   and have no download URI or completion timestamp until processing
 *   finishes.
 *
 * Test flow:
 *
 * 1. Join as todoUser (receive user id and be authenticated automatically)
 * 2. Baseline list (robust; do not assume emptiness)
 * 3. Capture timestamp before creation (for later filtered listing)
 * 4. Create two export jobs: json and csv
 * 5. Validate immediate post-creation states (status/requested, no download URI,
 *    no completed_at)
 * 6. List with from_created_at filter; ensure both created jobs are present
 * 7. List with status filter (requested); ensure both present and all statuses
 *    match
 * 8. List with export_format filters (json/csv); ensure respective jobs are
 *    present
 */
export async function test_api_data_export_jobs_list_after_creation(
  connection: api.IConnection,
) {
  // 1) Join as todoUser
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authorized);

  // 2) Baseline listing (robust: do not assume empty)
  const baselinePage = await api.functional.todoApp.todoUser.dataExports.index(
    connection,
    {
      body: {
        page: 1 satisfies number as number,
        limit: 50 satisfies number as number,
      } satisfies ITodoAppDataExport.IRequest,
    },
  );
  typia.assert(baselinePage);

  // 3) Capture timestamp to filter newly created jobs later
  const fromTs: string = new Date().toISOString();

  // 4) Create two data export jobs (json, csv)
  const fmtJson: ETodoAppDataExportFormat = "json";
  const fmtCsv: ETodoAppDataExportFormat = "csv";

  const createdJson =
    await api.functional.todoApp.todoUser.users.dataExports.create(connection, {
      userId: authorized.id,
      body: { export_format: fmtJson } satisfies ITodoAppDataExport.ICreate,
    });
  typia.assert(createdJson);

  const createdCsv =
    await api.functional.todoApp.todoUser.users.dataExports.create(connection, {
      userId: authorized.id,
      body: { export_format: fmtCsv } satisfies ITodoAppDataExport.ICreate,
    });
  typia.assert(createdCsv);

  // 5) Validate immediate post-creation business states
  TestValidator.equals(
    "json export status is requested",
    createdJson.status,
    "requested",
  );
  TestValidator.equals(
    "csv export status is requested",
    createdCsv.status,
    "requested",
  );

  TestValidator.predicate(
    "json export has no download URI right after creation",
    createdJson.download_uri === null || createdJson.download_uri === undefined,
  );
  TestValidator.predicate(
    "csv export has no download URI right after creation",
    createdCsv.download_uri === null || createdCsv.download_uri === undefined,
  );

  TestValidator.predicate(
    "json export not completed immediately",
    createdJson.completed_at === null || createdJson.completed_at === undefined,
  );
  TestValidator.predicate(
    "csv export not completed immediately",
    createdCsv.completed_at === null || createdCsv.completed_at === undefined,
  );

  // 6) List with from_created_at (lower bound) to target the two newly created
  const recentPage = await api.functional.todoApp.todoUser.dataExports.index(
    connection,
    {
      body: {
        from_created_at: fromTs satisfies string as string,
        page: 1 satisfies number as number,
        limit: 100 satisfies number as number,
      } satisfies ITodoAppDataExport.IRequest,
    },
  );
  typia.assert(recentPage);

  const recentIds = recentPage.data.map((s) => s.id);
  TestValidator.predicate(
    "recent listing includes at least two records",
    recentPage.data.length >= 2,
  );
  TestValidator.predicate(
    "recent listing includes created json export",
    recentIds.includes(createdJson.id),
  );
  TestValidator.predicate(
    "recent listing includes created csv export",
    recentIds.includes(createdCsv.id),
  );

  // 7) Filter by status = requested, ensure both present and all requested
  const requestedPage = await api.functional.todoApp.todoUser.dataExports.index(
    connection,
    {
      body: {
        status: "requested",
        from_created_at: fromTs satisfies string as string,
        page: 1 satisfies number as number,
        limit: 100 satisfies number as number,
      } satisfies ITodoAppDataExport.IRequest,
    },
  );
  typia.assert(requestedPage);

  const requestedIds = requestedPage.data.map((s) => s.id);
  TestValidator.predicate(
    "requested filter returns at least two records",
    requestedPage.data.length >= 2,
  );
  for (const s of requestedPage.data) {
    TestValidator.equals(
      "each returned summary has status requested",
      s.status,
      "requested",
    );
  }
  TestValidator.predicate(
    "requested filter includes created json export",
    requestedIds.includes(createdJson.id),
  );
  TestValidator.predicate(
    "requested filter includes created csv export",
    requestedIds.includes(createdCsv.id),
  );

  // 8) Filter by export_format for each created job
  const jsonOnly = await api.functional.todoApp.todoUser.dataExports.index(
    connection,
    {
      body: {
        export_format: fmtJson,
        from_created_at: fromTs satisfies string as string,
        page: 1 satisfies number as number,
        limit: 100 satisfies number as number,
      } satisfies ITodoAppDataExport.IRequest,
    },
  );
  typia.assert(jsonOnly);
  TestValidator.predicate(
    "json format filter contains the created json export",
    jsonOnly.data.map((s) => s.id).includes(createdJson.id),
  );

  const csvOnly = await api.functional.todoApp.todoUser.dataExports.index(
    connection,
    {
      body: {
        export_format: fmtCsv,
        from_created_at: fromTs satisfies string as string,
        page: 1 satisfies number as number,
        limit: 100 satisfies number as number,
      } satisfies ITodoAppDataExport.IRequest,
    },
  );
  typia.assert(csvOnly);
  TestValidator.predicate(
    "csv format filter contains the created csv export",
    csvOnly.data.map((s) => s.id).includes(createdCsv.id),
  );
}
