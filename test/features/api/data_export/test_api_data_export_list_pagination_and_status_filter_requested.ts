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
 * List personal data export jobs with pagination and status filtering
 * (requested).
 *
 * Workflow:
 *
 * 1. Register a new todoUser and obtain authenticated context
 * 2. Seed 15 export jobs (alternating formats) for that user and verify creation
 *    semantics
 * 3. List page 1 (limit 10) with status=requested, order_by=created_at desc
 * 4. List page 2 (remaining 5)
 * 5. Validate pagination metadata, ordering, status filter, owner scoping, and
 *    error case on invalid limit
 */
export async function test_api_data_export_list_pagination_and_status_filter_requested(
  connection: api.IConnection,
) {
  // 1) Register a new todoUser
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBody });
  typia.assert(authorized);
  const userId = authorized.id;

  // 2) Seed 15 export jobs
  const formats = [
    "json",
    "csv",
  ] as const satisfies readonly ETodoAppDataExportFormat[];
  const created: ITodoAppDataExport[] = await ArrayUtil.asyncRepeat(
    15,
    async (i) => {
      const createBody = {
        export_format: formats[i % formats.length],
      } satisfies ITodoAppDataExport.ICreate;
      const output: ITodoAppDataExport =
        await api.functional.todoApp.todoUser.users.dataExports.create(
          connection,
          { userId, body: createBody },
        );
      typia.assert(output);
      // status should be requested; download_uri not present while requested
      TestValidator.equals(
        "newly created export has status 'requested'",
        output.status,
        "requested",
      );
      TestValidator.predicate(
        "download_uri must be null/undefined while status is requested",
        output.download_uri === null || output.download_uri === undefined,
      );
      return output;
    },
  );

  // Prepare expected order by created_at desc
  const expectedByCreatedDesc: ITodoAppDataExport[] = [...created].sort(
    (a, b) => b.created_at.localeCompare(a.created_at),
  );
  const expectedIdsDesc: string[] = expectedByCreatedDesc.map((e) => e.id);

  // 3) List page 1
  const page1Body = {
    status: "requested",
    order_by: "created_at",
    order_dir: "desc",
    page: 1,
    limit: 10,
  } satisfies ITodoAppDataExport.IRequest;
  const page1: IPageITodoAppDataExport.ISummary =
    await api.functional.todoApp.todoUser.users.dataExports.index(connection, {
      userId,
      body: page1Body,
    });
  typia.assert(page1);

  // Validate page1 pagination metadata and content
  TestValidator.equals("page1.limit is 10", page1.pagination.limit, 10);
  TestValidator.equals(
    "page1.records equals total seeded count",
    page1.pagination.records,
    created.length,
  );
  TestValidator.equals(
    "page1.pages equals ceil(total/limit)",
    page1.pagination.pages,
    Math.ceil(created.length / 10),
  );
  TestValidator.equals("page1.data length is 10", page1.data.length, 10);
  // All requested
  page1.data.forEach((s, idx) =>
    TestValidator.equals(
      `page1 item #${idx} status is requested`,
      s.status,
      "requested",
    ),
  );
  // Owner scoping: IDs must be from seeded set
  const seededSet = new Set(created.map((c) => c.id));
  await TestValidator.predicate(
    "page1 items belong to the owner (seeded set)",
    async () => page1.data.every((s) => seededSet.has(s.id)),
  );
  // Ordering check for page1
  const page1Ids = page1.data.map((s) => s.id);
  const expectedPage1Ids = expectedIdsDesc.slice(0, 10);
  TestValidator.equals(
    "page1 ids match expected order (created_at desc)",
    page1Ids,
    expectedPage1Ids,
  );

  // 4) List page 2
  const page2Body = {
    status: "requested",
    order_by: "created_at",
    order_dir: "desc",
    page: 2,
    limit: 10,
  } satisfies ITodoAppDataExport.IRequest;
  const page2: IPageITodoAppDataExport.ISummary =
    await api.functional.todoApp.todoUser.users.dataExports.index(connection, {
      userId,
      body: page2Body,
    });
  typia.assert(page2);

  TestValidator.equals("page2.data length is 5", page2.data.length, 5);
  page2.data.forEach((s, idx) =>
    TestValidator.equals(
      `page2 item #${idx} status is requested`,
      s.status,
      "requested",
    ),
  );
  // No overlap between pages
  const page2Ids = page2.data.map((s) => s.id);
  await TestValidator.predicate(
    "no overlap between page1 and page2 ids",
    async () => page2Ids.every((id) => !page1Ids.includes(id)),
  );
  // Combined ordering check
  const combinedIds = [...page1Ids, ...page2Ids];
  const expectedAllIds = expectedIdsDesc.slice(0, 15);
  TestValidator.equals(
    "combined page1+page2 ids match expected order",
    combinedIds,
    expectedAllIds,
  );

  // 'requested' items should not have completion timestamps in use
  [...page1.data, ...page2.data].forEach((s, idx) => {
    TestValidator.predicate(
      `requested item #${idx} has no completed_at`,
      s.completed_at === null || s.completed_at === undefined,
    );
  });

  // 5) Error case: invalid pagination (limit=0)
  await TestValidator.error(
    "invalid pagination (limit=0) should fail",
    async () => {
      await api.functional.todoApp.todoUser.users.dataExports.index(
        connection,
        {
          userId,
          body: {
            status: "requested",
            order_by: "created_at",
            order_dir: "desc",
            page: 1,
            limit: 0, // out of allowed range per policy
          } satisfies ITodoAppDataExport.IRequest,
        },
      );
    },
  );
}
