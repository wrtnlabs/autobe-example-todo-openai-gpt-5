import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { IEAdminStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAdminStatus";
import type { IEAuditEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAuditEventType";
import type { ITodoMvpAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdmin";
import type { ITodoMvpAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdminJoin";
import type { ITodoMvpAuditEvent } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAuditEvent";

/**
 * Ensure admin-only audit event detail returns error for non-existent ID.
 *
 * Business goals:
 *
 * - RBAC: Only admins can access audit trail. An unauthenticated request must
 *   fail.
 * - Not-found: Requesting a valid-but-unknown UUID should result in an error (do
 *   not assert status code).
 * - Type and contract safety: Use strict DTO variants and typia.assert for
 *   non-void responses.
 * - Simulation compatibility: In simulate mode, providers always return random
 *   success; thus, validate structure instead of erroring.
 *
 * Steps:
 *
 * 1. Try to read an audit event without authentication and expect failure
 *    (non-simulate only).
 * 2. Join as admin via /auth/admin/join and assert the authorization payload.
 * 3. Call GET /todoMvp/admin/auditEvents/{auditEventId} with a random UUID that
 *    should not exist and expect failure (non-simulate only).
 * 4. If simulate mode is on, just perform a successful call and assert the
 *    response instead (since simulator returns random success).
 */
export async function test_api_audit_event_detail_not_found(
  connection: api.IConnection,
) {
  // 0) Prepare unauthenticated connection clone for RBAC check (no header manipulation afterward)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 1) RBAC: unauthenticated access should fail (only when not in simulate mode)
  if (!connection.simulate) {
    const randomId: string & tags.Format<"uuid"> = typia.random<
      string & tags.Format<"uuid">
    >();
    await TestValidator.error(
      "unauthenticated cannot access admin audit event detail",
      async () => {
        await api.functional.todoMvp.admin.auditEvents.at(unauthConn, {
          auditEventId: randomId,
        });
      },
    );
  }

  // 2) Admin registration (join) to obtain authorization
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12); // >= 8 chars as per MinLength<8>
  const authorized: ITodoMvpAdmin.IAuthorized =
    await api.functional.auth.admin.join(connection, {
      body: {
        email,
        password,
      } satisfies ITodoMvpAdminJoin.ICreate,
    });
  typia.assert(authorized);
  TestValidator.equals(
    "admin email in auth response matches the join request",
    authorized.email,
    email,
  );

  // 3) Not-found validation for non-existent UUID (only when not in simulate mode)
  if (!connection.simulate) {
    const nonexistentId: string & tags.Format<"uuid"> = typia.random<
      string & tags.Format<"uuid">
    >();
    await TestValidator.error(
      "requesting non-existent audit event should fail",
      async () => {
        await api.functional.todoMvp.admin.auditEvents.at(connection, {
          auditEventId: nonexistentId,
        });
      },
    );
  } else {
    // 4) In simulate mode, provider returns random success; validate structure only
    const someId: string & tags.Format<"uuid"> = typia.random<
      string & tags.Format<"uuid">
    >();
    const sample: ITodoMvpAuditEvent =
      await api.functional.todoMvp.admin.auditEvents.at(connection, {
        auditEventId: someId,
      });
    typia.assert(sample);
  }
}
