import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppSession } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSession";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Retrieve and validate a user's session detail with owner scoping and
 * authorization boundaries.
 *
 * Due to the absence of an API that returns the created sessionId from the
 * authentication response or lists sessions, this test performs:
 *
 * 1. User join to obtain an authenticated context (Authorization header is
 *    auto-configured by the SDK).
 * 2. Success path in simulation mode to validate ITodoAppSession structure and
 *    core time-ordering business logic (expires_at >= issued_at; revoked_at, if
 *    present, is not before issued_at).
 * 3. Negative authorization scenarios against a real backend:
 *
 *    - Unauthenticated access must be rejected.
 *    - Authenticated access with mismatched userId/sessionId must be rejected.
 */
export async function test_api_user_session_detail_current_active_session(
  connection: api.IConnection,
) {
  // 1) Register and authenticate a user (join)
  const email = typia.random<string & tags.Format<"email">>();
  const password = typia.random<
    string & tags.MinLength<8> & tags.MaxLength<64>
  >();
  const joinBody = { email, password } satisfies ITodoAppTodoUser.ICreate;

  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);
  typia.assert<IAuthorizationToken>(authorized.token);
  const userId = authorized.id; // string & tags.Format<"uuid">

  // 2) Success path (simulation) - validate shape and time logic
  const simConn: api.IConnection = { ...connection, simulate: true };
  const sessionIdSim = typia.random<string & tags.Format<"uuid">>();
  const sessionSim = await api.functional.todoApp.todoUser.users.sessions.at(
    simConn,
    { userId, sessionId: sessionIdSim },
  );
  typia.assert(sessionSim);
  // Reinforce expectation that owner id is a UUID
  typia.assert<string & tags.Format<"uuid">>(sessionSim.todo_app_user_id);

  const issuedMs = Date.parse(sessionSim.issued_at);
  const expiresMs = Date.parse(sessionSim.expires_at);
  TestValidator.predicate(
    "session expiry is not before issue time (simulated)",
    expiresMs >= issuedMs,
  );
  if (sessionSim.revoked_at !== null && sessionSim.revoked_at !== undefined) {
    const revokedMs = Date.parse(sessionSim.revoked_at);
    TestValidator.predicate(
      "revoked_at is not before issued_at (simulated)",
      revokedMs >= issuedMs,
    );
  }

  // 3) Negative: unauthenticated access must be rejected
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated request must be rejected",
    async () =>
      await api.functional.todoApp.todoUser.users.sessions.at(unauthConn, {
        userId,
        sessionId: typia.random<string & tags.Format<"uuid">>(),
      }),
  );

  // 4) Negative: mismatched ownership must be rejected
  await TestValidator.error(
    "mismatched userId should be denied",
    async () =>
      await api.functional.todoApp.todoUser.users.sessions.at(connection, {
        userId: typia.random<string & tags.Format<"uuid">>(),
        sessionId: typia.random<string & tags.Format<"uuid">>(),
      }),
  );
}
