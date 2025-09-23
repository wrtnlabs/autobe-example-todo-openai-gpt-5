import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppAuditLog } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAuditLog";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Verify admin-context audit log detail request returns not-found for a
 * nonexistent ID.
 *
 * Business context:
 *
 * - SystemAdmin registers (join) to obtain an authenticated context.
 * - Admin queries a single audit log by id using a random, well-formed UUID that
 *   is expected not to exist, and should receive a not-found style error.
 *
 * Validation policy:
 *
 * - Do NOT assert specific HTTP status codes; only assert that an error occurs.
 * - Validate join response type via typia.assert, rely on SDK for auth headers.
 *
 * Steps:
 *
 * 1. Join as system admin with valid randomized credentials.
 * 2. Attempt to GET audit log by random UUID and assert error with
 *    TestValidator.error.
 */
export async function test_api_audit_log_detail_not_found_with_admin_context(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin via join
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // satisfies MinLength<8> & MaxLength<64>
  } satisfies ITodoAppSystemAdminJoin.ICreate;

  const authorized: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: adminJoinBody,
    });
  typia.assert(authorized);

  // 2) Call GET /todoApp/systemAdmin/auditLogs/{auditLogId} with random valid UUID
  const unknownAuditLogId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();

  // Assert that requesting a nonexistent audit log triggers an error.
  // Per policy, do not assert specific status code—only the error occurrence.
  await TestValidator.error(
    "requesting nonexistent audit log should fail",
    async () => {
      await api.functional.todoApp.systemAdmin.auditLogs.at(connection, {
        auditLogId: unknownAuditLogId,
      });
    },
  );
}
