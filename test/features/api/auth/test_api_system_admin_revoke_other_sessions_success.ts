import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppSystemAdminLogin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminLogin";
import type { ITodoAppSystemAdminRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminRefresh";
import type { ITodoAppSystemAdminSessionRevocation } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminSessionRevocation";
import type { ITodoAppSystemAdminSessionRevocationResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminSessionRevocationResult";

export async function test_api_system_admin_revoke_other_sessions_success(
  connection: api.IConnection,
) {
  // 1) Register a systemAdmin → Session A (current session)
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password = "Password#1234"; // length >= 8, includes mixed chars

  const joined = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email,
      password,
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(joined);

  const adminIdA = joined.id;
  const refreshA = joined.token.refresh;

  // 2) From a different client, login with the same credentials → Session B
  const connB: api.IConnection = { ...connection, headers: {} };
  const loggedB = await api.functional.auth.systemAdmin.login(connB, {
    body: {
      email,
      password,
    } satisfies ITodoAppSystemAdminLogin.ICreate,
  });
  typia.assert(loggedB);
  const refreshB = loggedB.token.refresh;

  // 3) Revoke other sessions using Session A (current) context
  const revokeResult =
    await api.functional.my.auth.systemAdmin.sessions.revoke.revokeOtherSessions(
      connection,
      {
        body: {
          // default: revoke other sessions only
          reason: "Security hygiene: revoke all other sessions",
        } satisfies ITodoAppSystemAdminSessionRevocation.ICreate,
      },
    );
  typia.assert(revokeResult);

  TestValidator.predicate(
    "revoked_sessions_count should be at least 1 (Session B)",
    revokeResult.revoked_sessions_count >= 1,
  );
  TestValidator.predicate(
    "revocation result success flag should be true",
    revokeResult.success === true,
  );

  // 4) Attempt to refresh with Session B's now-revoked refresh token → must fail
  await TestValidator.error(
    "revoked Session B must not be able to refresh",
    async () => {
      await api.functional.auth.systemAdmin.refresh(connB, {
        body: {
          refresh_token: refreshB,
        } satisfies ITodoAppSystemAdminRefresh.ICreate,
      });
    },
  );

  // Validate that current session (A) remains valid by performing a successful refresh
  const refreshedA = await api.functional.auth.systemAdmin.refresh(connection, {
    body: {
      refresh_token: refreshA,
    } satisfies ITodoAppSystemAdminRefresh.ICreate,
  });
  typia.assert(refreshedA);
  TestValidator.equals(
    "admin id must remain consistent after refresh for Session A",
    refreshedA.id,
    adminIdA,
  );

  // 5) Optional: idempotency check - calling revoke again should still succeed
  const revokeAgain =
    await api.functional.my.auth.systemAdmin.sessions.revoke.revokeOtherSessions(
      connection,
      {
        body: {
          reason: "Repeat revoke to verify idempotency",
        } satisfies ITodoAppSystemAdminSessionRevocation.ICreate,
      },
    );
  typia.assert(revokeAgain);
  TestValidator.predicate(
    "second revocation should be idempotently successful",
    revokeAgain.success === true,
  );
}
