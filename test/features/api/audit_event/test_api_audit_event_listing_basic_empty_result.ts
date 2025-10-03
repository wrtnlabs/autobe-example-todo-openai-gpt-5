import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { IEAdminStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAdminStatus";
import type { IEAuditEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAuditEventType";
import type { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoMvpAuditEvent } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoMvpAuditEvent";
import type { ITodoMvpAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdmin";
import type { ITodoMvpAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdminJoin";
import type { ITodoMvpAuditEvent } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAuditEvent";

/**
 * Verify admin-only audit event listing returns empty results for a future
 * window and rejects unauthenticated access.
 *
 * Steps:
 *
 * 1. Admin joins (auth) to obtain a valid session.
 * 2. Query PATCH /todoMvp/admin/auditEvents with a future created_at range that
 *    guarantees zero matches.
 * 3. Validate the response structure and business expectations:
 *
 *    - Data is empty
 *    - Pagination.records is 0
 * 4. RBAC negative: unauthenticated connection must fail on the same request.
 */
export async function test_api_audit_event_listing_basic_empty_result(
  connection: api.IConnection,
) {
  // 1) Admin joins (authentication)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8>>(),
  } satisfies ITodoMvpAdminJoin.ICreate;

  const adminAuth = await api.functional.auth.admin.join(connection, {
    body: joinBody,
  });
  typia.assert(adminAuth);

  // 2) Prepare a future time window that guarantees empty results
  const now = Date.now();
  const future = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();

  const requestBody = {
    page: 1,
    limit: 10,
    actor_user_id: null,
    actor_admin_id: null,
    target_todo_id: null,
    event_types: null,
    created_from: future,
    created_to: future,
    sort_by: "created_at",
    order: "desc",
  } satisfies ITodoMvpAuditEvent.IRequest;

  // 3) Call audit listing and validate empty result
  const page = await api.functional.todoMvp.admin.auditEvents.index(
    connection,
    {
      body: requestBody,
    },
  );
  typia.assert(page);

  TestValidator.equals(
    "future-filtered audit events must be empty",
    page.data.length,
    0,
  );
  TestValidator.equals(
    "pagination records should be zero when no matches",
    page.pagination.records,
    0,
  );

  // 4) RBAC negative: unauthenticated access must fail
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated access to admin audit listing should be rejected",
    async () => {
      await api.functional.todoMvp.admin.auditEvents.index(unauthConn, {
        body: requestBody,
      });
    },
  );
}
