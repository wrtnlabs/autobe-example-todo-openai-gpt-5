import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppAuditLog } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAuditLog";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Forbid audit log detail access to non-admin users (todoUser).
 *
 * Business context:
 *
 * - ITodoAppAuditLog contains security-sensitive records restricted to
 *   systemAdmin.
 * - A regular member (todoUser) must not be able to fetch audit log details.
 *
 * Steps:
 *
 * 1. Register and authenticate a todoUser via auth.todoUser.join.
 * 2. Attempt to GET a systemAdmin audit log detail with a random UUID using the
 *    member session.
 *
 * Validations:
 *
 * - Assert the join response structure.
 * - Expect the audit log GET call to throw (authorization failure). Do not check
 *   specific HTTP status codes.
 */
export async function test_api_audit_log_detail_unauthorized_access_forbidden(
  connection: api.IConnection,
) {
  // 1) Register a regular member (todoUser) and authenticate
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphabets(12), // 8-64 chars allowed; use 12
  } satisfies ITodoAppTodoUser.ICreate;
  const member: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBody });
  typia.assert(member);

  // 2) Attempt to access systemAdmin audit log detail as a non-admin member
  const auditLogId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();

  await TestValidator.error(
    "non-admin cannot access system admin audit log detail",
    async () => {
      await api.functional.todoApp.systemAdmin.auditLogs.at(connection, {
        auditLogId,
      });
    },
  );
}
