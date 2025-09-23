import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ITodoAppSystemAdminSessionRevocation } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminSessionRevocation";
import type { ITodoAppSystemAdminSessionRevocationResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminSessionRevocationResult";

/**
 * Verify unauthenticated access is rejected for system admin session
 * revocation.
 *
 * Business context:
 *
 * - POST /my/auth/systemAdmin/sessions/revoke targets the caller's (system admin)
 *   sessions and requires authentication. Unauthenticated requests must fail.
 *
 * Steps:
 *
 * 1. Build an unauthenticated connection (clone with empty headers; do not touch
 *    headers afterwards).
 * 2. Prepare a valid revocation request body (use revoke_current and a short
 *    reason).
 * 3. Call the endpoint with the unauthenticated connection.
 * 4. Assert an error is thrown (do not assert specific HTTP status codes).
 */
export async function test_api_system_admin_revoke_other_sessions_unauthorized(
  connection: api.IConnection,
) {
  // 1) Unauthenticated connection (no headers). Do not manipulate after creation.
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 2) Valid request body — include both optional fields to exercise typical usage.
  const body = {
    revoke_current: true,
    reason: RandomGenerator.paragraph({ sentences: 6 }),
  } satisfies ITodoAppSystemAdminSessionRevocation.ICreate;

  // 3) 4) Expect rejection for unauthenticated caller (no concrete status assertion as per policy).
  await TestValidator.error(
    "unauthenticated system admin cannot revoke sessions",
    async () => {
      await api.functional.my.auth.systemAdmin.sessions.revoke.revokeOtherSessions(
        unauthConn,
        { body },
      );
    },
  );
}
