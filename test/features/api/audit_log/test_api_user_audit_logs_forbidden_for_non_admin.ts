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
 * Ensure non-admin users cannot access admin-only per-user audit logs.
 *
 * Business goal:
 *
 * - Verify that a regular todoUser cannot retrieve audit logs through the
 *   admin-only endpoint: PATCH /todoApp/systemAdmin/users/{userId}/auditLogs.
 *
 * Steps:
 *
 * 1. Register and authenticate a regular todoUser via /auth/todoUser/join.
 * 2. As that todoUser (non-admin), attempt to call the admin-only audit logs
 *    endpoint using their own id as {userId} with some filters.
 * 3. Assert that the call fails (authorization error). Do not check specific HTTP
 *    status codes or error message contents.
 */
export async function test_api_user_audit_logs_forbidden_for_non_admin(
  connection: api.IConnection,
) {
  // 1) Register and authenticate a regular todoUser
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBody });
  typia.assert(authorized);

  // 2) Prepare arbitrary (but valid) filters for the admin endpoint
  const now = Date.now();
  const requestBody = {
    page: 1,
    limit: 10,
    actor_user_id: authorized.id,
    created_from: new Date(now - 1000 * 60 * 60).toISOString(), // 1 hour ago
    created_to: new Date(now).toISOString(),
    sort_by: "created_at",
    sort_dir: "desc",
  } satisfies ITodoAppAuditLog.IRequest;

  // 3) Attempt to access admin-only endpoint as non-admin and expect error
  await TestValidator.error(
    "non-admin todoUser must not access admin-only audit logs",
    async () => {
      await api.functional.todoApp.systemAdmin.users.auditLogs.index(
        connection,
        {
          userId: authorized.id,
          body: requestBody,
        },
      );
    },
  );
}
