import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppAuditLog } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppAuditLog";
import type { ITodoAppAuditLog } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAuditLog";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Verify that a non-admin (todoUser) cannot access system admin audit log
 * search.
 *
 * Business context:
 *
 * - The audit log search endpoint is restricted to systemAdmin users only.
 * - A regular member (todoUser) should be denied when attempting to query audit
 *   logs.
 *
 * Test steps:
 *
 * 1. Register a new todoUser via join (issues token automatically via SDK).
 * 2. Attempt PATCH /todoApp/systemAdmin/auditLogs with a minimal valid request
 *    body.
 * 3. Validate that the request is rejected (assert only that an error occurs; do
 *    not check status codes).
 * 4. Additionally, try with an unauthenticated connection clone to confirm
 *    rejection.
 */
export async function test_api_audit_log_search_unauthorized_role_forbidden(
  connection: api.IConnection,
) {
  // 1) Register a new todoUser (and acquire token via SDK auto header management)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBody });
  typia.assert(authorized);

  // 2) Prepare minimal, valid search request for audit logs
  const searchBody = {
    page: 1,
    limit: 1,
  } satisfies ITodoAppAuditLog.IRequest;

  // 3) As a todoUser, audit log search must be rejected
  await TestValidator.error(
    "todoUser must not access systemAdmin audit logs",
    async () => {
      await api.functional.todoApp.systemAdmin.auditLogs.index(connection, {
        body: searchBody,
      });
    },
  );

  // 4) Optional: also ensure unauthenticated access is rejected
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated access to systemAdmin audit logs must be rejected",
    async () => {
      await api.functional.todoApp.systemAdmin.auditLogs.index(unauthConn, {
        body: searchBody,
      });
    },
  );
}
