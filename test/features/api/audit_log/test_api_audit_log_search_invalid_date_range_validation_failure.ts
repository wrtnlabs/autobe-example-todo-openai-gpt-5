import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppAuditLog } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppAuditLog";
import type { ITodoAppAuditLog } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAuditLog";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Validate that audit log search rejects an illogical time window while
 * accepting a valid one for an authenticated system admin.
 *
 * Why: Governance consoles must prevent nonsensical time-range queries (e.g.,
 * created_from later than created_to) and respond with a validation error
 * instead of returning partial data.
 *
 * Steps:
 *
 * 1. Join as system admin (token is auto-attached by SDK)
 * 2. Call PATCH /todoApp/systemAdmin/auditLogs with a valid time window
 *
 *    - Ensure page-shaped response via typia.assert
 * 3. Call the same endpoint with an illogical time window
 *
 *    - Expect error using TestValidator.error (no status/message checks)
 */
export async function test_api_audit_log_search_invalid_date_range_validation_failure(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin
  const authorized: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(authorized);

  // Utility: now reference
  const nowMs = Date.now();

  // 2) Baseline valid search (created_from <= created_to)
  const validFrom: string = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();
  const validTo: string = new Date(nowMs).toISOString();
  const validBody = {
    page: 1,
    limit: 10,
    created_from: validFrom,
    created_to: validTo,
    // leaving remaining filters undefined as they are optional
  } satisfies ITodoAppAuditLog.IRequest;

  const page = await api.functional.todoApp.systemAdmin.auditLogs.index(
    connection,
    { body: validBody },
  );
  typia.assert(page);

  // 3) Invalid logical range (created_from > created_to) should fail
  const invalidFrom: string = new Date(nowMs + 60 * 60 * 1000).toISOString();
  const invalidTo: string = new Date(nowMs - 60 * 60 * 1000).toISOString();
  const invalidBody = {
    page: 1,
    limit: 10,
    created_from: invalidFrom,
    created_to: invalidTo,
  } satisfies ITodoAppAuditLog.IRequest;

  await TestValidator.error(
    "rejects illogical date range (created_from after created_to)",
    async () => {
      await api.functional.todoApp.systemAdmin.auditLogs.index(connection, {
        body: invalidBody,
      });
    },
  );
}
