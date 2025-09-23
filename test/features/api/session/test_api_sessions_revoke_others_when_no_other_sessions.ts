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

/**
 * Revoke-others is a no-op when no other sessions exist.
 *
 * Scenario:
 *
 * 1. Join a new todoUser to establish a single session.
 * 2. Call revoke-others with an empty filter payload.
 * 3. Re-list sessions and validate that nothing changed and no session is revoked.
 *
 * Validations:
 *
 * - Initial listing shows exactly one session and it is not revoked.
 * - After revoke-others, session count and IDs remain the same.
 * - No session has a non-null revoked_at.
 */
export async function test_api_sessions_revoke_others_when_no_other_sessions(
  connection: api.IConnection,
) {
  // 1) Join a new todoUser (authenticate and create the first session)
  const createBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: createBody });
  typia.assert(authorized);

  // 2) Baseline: list sessions. IRequest has only optional fields, so empty object is valid.
  const listBody = {} satisfies ITodoAppSession.IRequest;
  const before: IPageITodoAppSession.ISummary =
    await api.functional.todoApp.todoUser.users.sessions.index(connection, {
      userId: authorized.id,
      body: listBody,
    });
  typia.assert(before);

  TestValidator.equals(
    "newly joined user should have exactly one session",
    before.data.length,
    1,
  );
  TestValidator.predicate(
    "initial session should not be revoked",
    before.data.every(
      (s) => s.revoked_at === null || s.revoked_at === undefined,
    ),
  );

  // 3) Action: revoke other sessions (no-op expected since only current session exists)
  const revokeBody = {} satisfies ITodoAppSession.IRevokeOthers;
  await api.functional.auth.todoUser.sessions.revokeOthers.revokeOtherSessions(
    connection,
    { body: revokeBody },
  );

  // 4) Post-action: re-list and validate unchanged state
  const after: IPageITodoAppSession.ISummary =
    await api.functional.todoApp.todoUser.users.sessions.index(connection, {
      userId: authorized.id,
      body: listBody,
    });
  typia.assert(after);

  TestValidator.equals(
    "sessions count unchanged after revokeOthers when none exist",
    after.data.length,
    before.data.length,
  );

  const beforeIds = before.data.map((s) => s.id).sort();
  const afterIds = after.data.map((s) => s.id).sort();
  TestValidator.equals(
    "session IDs unchanged after noop revokeOthers",
    afterIds,
    beforeIds,
  );

  const revokedCount = after.data.filter(
    (s) => s.revoked_at !== null && s.revoked_at !== undefined,
  ).length;
  TestValidator.equals(
    "no sessions revoked by revokeOthers when none exist (count)",
    revokedCount,
    0,
  );
  TestValidator.predicate(
    "no sessions revoked by revokeOthers when none exist (predicate)",
    after.data.every(
      (s) => s.revoked_at === null || s.revoked_at === undefined,
    ),
  );
}
