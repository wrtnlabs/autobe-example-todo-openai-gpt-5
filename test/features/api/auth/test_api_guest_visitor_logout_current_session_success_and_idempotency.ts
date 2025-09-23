import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppGuestVisitor";
import type { ITodoAppSessionRevocation } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSessionRevocation";

/**
 * Revoke current session for guestVisitor and ensure idempotent behavior.
 *
 * Workflow:
 *
 * 1. Join as guestVisitor to obtain an authenticated context (SDK sets
 *    Authorization).
 * 2. Call logout with an optional reason and assert a revocation summary is
 *    returned.
 * 3. Call logout again with the same reason to validate idempotency (stable
 *    revocation record).
 * 4. Optional negative: verify unauthenticated logout fails using a fresh
 *    connection with empty headers.
 *
 * Notes:
 *
 * - We validate idempotency by asserting the second response references the same
 *   revocation id and the same session id as the first response.
 * - We do not perform status code verification or direct header manipulation.
 */
export async function test_api_guest_visitor_logout_current_session_success_and_idempotency(
  connection: api.IConnection,
) {
  // Optional negative: unauthenticated logout should fail
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error("unauthenticated logout should fail", async () => {
    await api.functional.auth.guestVisitor.logout(unauthConn, {
      body: {
        reason: "user_logout",
      } satisfies ITodoAppSessionRevocation.ICreate,
    });
  });

  // 1) Join as guestVisitor (SDK will set Authorization header automatically)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
  } satisfies ITodoAppGuestVisitor.IJoin;
  const authorized = await api.functional.auth.guestVisitor.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);

  // 2) First logout: revoke current session
  const logoutBody = {
    reason: "user_logout",
  } satisfies ITodoAppSessionRevocation.ICreate;
  const first = await api.functional.auth.guestVisitor.logout(connection, {
    body: logoutBody,
  });
  typia.assert(first);

  // 3) Second logout (idempotent)
  const second = await api.functional.auth.guestVisitor.logout(connection, {
    body: logoutBody,
  });
  typia.assert(second);

  // 4) Idempotency validations
  TestValidator.equals(
    "idempotent: revocation id remains stable",
    second.id,
    first.id,
  );
  TestValidator.equals(
    "idempotent: same session id is referenced",
    second.todo_app_session_id,
    first.todo_app_session_id,
  );
  TestValidator.equals(
    "idempotent: revoked_at timestamp does not change",
    second.revoked_at,
    first.revoked_at,
  );
}
