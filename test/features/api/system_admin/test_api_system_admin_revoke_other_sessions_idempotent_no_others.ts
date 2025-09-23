import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppSystemAdminSessionRevocation } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminSessionRevocation";
import type { ITodoAppSystemAdminSessionRevocationResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminSessionRevocationResult";

/**
 * Verify revoking other sessions is a no-op when only the current session
 * exists and that repeated calls are idempotent.
 *
 * Flow:
 *
 * 1. Join a new system administrator to obtain Session A and authenticate.
 * 2. Call revoke-other-sessions once; expect success and zero sessions revoked.
 * 3. Call revoke-other-sessions again; expect the same success and zero count.
 *
 * Validations:
 *
 * - Both responses are type-correct (typia.assert).
 * - Success === true for both responses.
 * - Revoked_sessions_count === 0 for both responses.
 * - Second call's count equals the first call's (idempotency).
 */
export async function test_api_system_admin_revoke_other_sessions_idempotent_no_others(
  connection: api.IConnection,
) {
  // 1) Join system admin (Session A is created and authorized)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const authorized: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, { body: joinBody });
  typia.assert(authorized);

  // 2) First revoke-other-sessions call (should find zero others)
  const revokeBody = {
    reason: RandomGenerator.paragraph({ sentences: 6 }),
  } satisfies ITodoAppSystemAdminSessionRevocation.ICreate;
  const first: ITodoAppSystemAdminSessionRevocationResult =
    await api.functional.my.auth.systemAdmin.sessions.revoke.revokeOtherSessions(
      connection,
      { body: revokeBody },
    );
  typia.assert(first);

  TestValidator.predicate("first revoke succeeds", first.success === true);
  TestValidator.equals(
    "first revoke reports zero revoked sessions",
    first.revoked_sessions_count,
    0,
  );
  if (first.revoked_session_ids !== undefined) {
    TestValidator.equals(
      "first revoke id list length matches count",
      first.revoked_session_ids.length,
      first.revoked_sessions_count,
    );
  }

  // 3) Second revoke-other-sessions call (idempotency)
  const second: ITodoAppSystemAdminSessionRevocationResult =
    await api.functional.my.auth.systemAdmin.sessions.revoke.revokeOtherSessions(
      connection,
      { body: revokeBody },
    );
  typia.assert(second);

  TestValidator.predicate("second revoke succeeds", second.success === true);
  TestValidator.equals(
    "second revoke reports zero revoked sessions",
    second.revoked_sessions_count,
    0,
  );
  TestValidator.equals(
    "idempotency: second count equals first count",
    second.revoked_sessions_count,
    first.revoked_sessions_count,
  );
  if (second.revoked_session_ids !== undefined) {
    TestValidator.equals(
      "second revoke id list length matches count",
      second.revoked_session_ids.length,
      second.revoked_sessions_count,
    );
  }
}
