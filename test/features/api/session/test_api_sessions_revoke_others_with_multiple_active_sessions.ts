import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppSession } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppSession";
import type { ITodoAppSession } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSession";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppTodoUserLogin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserLogin";

/**
 * Revoke all other sessions while keeping current session active.
 *
 * Workflow:
 *
 * 1. Create a todoUser via join to establish session A and obtain userId
 * 2. From two other client contexts, login twice to establish sessions B and C
 * 3. Using session A, call revoke-others
 * 4. List sessions and verify that only the current session remains unrevoked
 */
export async function test_api_sessions_revoke_others_with_multiple_active_sessions(
  connection: api.IConnection,
) {
  // Prepare three separate client contexts (emulating different devices)
  const connA: api.IConnection = { ...connection, headers: {} };
  const connB: api.IConnection = { ...connection, headers: {} };
  const connC: api.IConnection = { ...connection, headers: {} };

  // 1) Create and authenticate a todoUser (session A)
  const email = typia.random<string & tags.Format<"email">>();
  const password = typia.random<
    string & tags.MinLength<8> & tags.MaxLength<64>
  >();

  const joinBody = { email, password } satisfies ITodoAppTodoUser.ICreate;
  const joined: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connA, { body: joinBody });
  typia.assert(joined);

  // 2) From other client contexts, login to create additional active sessions (B and C)
  const loginBody = {
    email,
    password,
  } satisfies ITodoAppTodoUserLogin.IRequest;
  const authB: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.login(connB, { body: loginBody });
  typia.assert(authB);
  const authC: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.login(connC, { body: loginBody });
  typia.assert(authC);

  // Sanity check before revocation: there should be at least two active sessions
  const pageBefore: IPageITodoAppSession.ISummary =
    await api.functional.todoApp.todoUser.users.sessions.index(connA, {
      userId: joined.id,
      body: {
        page: 1,
        limit: 100,
        status: "all",
      } satisfies ITodoAppSession.IRequest,
    });
  typia.assert(pageBefore);
  const activeBefore = pageBefore.data.filter(
    (s) => s.revoked_at === null || s.revoked_at === undefined,
  );
  TestValidator.predicate(
    "at least two active sessions exist before revocation",
    activeBefore.length >= 2,
  );

  // 3) Revoke other sessions using current session (connA)
  const revokeBody = {
    reason: "user_revoke_others",
  } satisfies ITodoAppSession.IRevokeOthers;
  await api.functional.auth.todoUser.sessions.revokeOthers.revokeOtherSessions(
    connA,
    {
      body: revokeBody,
    },
  );

  // 4) List sessions and verify revocation results
  const pageAfter: IPageITodoAppSession.ISummary =
    await api.functional.todoApp.todoUser.users.sessions.index(connA, {
      userId: joined.id,
      body: {
        page: 1,
        limit: 100,
        status: "all",
      } satisfies ITodoAppSession.IRequest,
    });
  typia.assert(pageAfter);

  const activeAfter = pageAfter.data.filter(
    (s) => s.revoked_at === null || s.revoked_at === undefined,
  );
  const revokedAfter = pageAfter.data.filter(
    (s) => s.revoked_at !== null && s.revoked_at !== undefined,
  );

  // Exactly one active session should remain (the caller's current session)
  TestValidator.equals(
    "exactly one active session remains after revocation",
    activeAfter.length,
    1,
  );

  // All other sessions should be revoked
  TestValidator.predicate(
    "at least two sessions were revoked",
    revokedAfter.length >= 2,
  );

  // All revoked sessions should have a non-null, consistent revoked_reason
  const revokedReasons = revokedAfter
    .map((s) => s.revoked_reason)
    .filter((v): v is string => v !== null && v !== undefined);
  TestValidator.equals(
    "revoked sessions have reasons populated",
    revokedReasons.length,
    revokedAfter.length,
  );
  const allReasonsEqual = revokedReasons.every((v) => v === revokedReasons[0]);
  TestValidator.predicate(
    "revoked reasons are consistent across revoked sessions",
    revokedReasons.length > 0 && allReasonsEqual,
  );
}
