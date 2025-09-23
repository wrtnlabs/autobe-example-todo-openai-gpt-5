import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppSessionRevocation } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSessionRevocation";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Verify session revocation read behavior after logout focusing on idempotency
 * and access control.
 *
 * Scenario rewrite rationale:
 *
 * - The SDK does not expose a sessionId in ITodoAppTodoUser.IAuthorized and no
 *   endpoint is provided to fetch the current session id. Therefore, we cannot
 *   deterministically query the exact revocation record of the just-logged-out
 *   session.
 * - Instead, we validate critical behaviors that are implementable with the
 *   provided APIs: logout idempotency and ownership/access control on the
 *   revocation read endpoint.
 *
 * Steps:
 *
 * 1. Join a new todoUser (auth established automatically by SDK).
 * 2. Logout current session.
 * 3. Logout again to confirm idempotency (no error).
 * 4. Try reading a revocation with a random UUID while authenticated with the
 *    (likely revoked) token — should fail.
 * 5. Try reading with an unauthenticated connection — should fail.
 */
export async function test_api_session_revocation_read_after_logout(
  connection: api.IConnection,
) {
  // 1) Join a new user (creates initial session and sets Authorization)
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12); // 8–64 length policy satisfied

  const joinBody = {
    email,
    password,
  } satisfies ITodoAppTodoUser.ICreate;

  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // 2) Logout current session
  await api.functional.auth.todoUser.logout(connection);

  // 3) Idempotency: logout again must not throw
  await api.functional.auth.todoUser.logout(connection);

  // 4) Attempt to read revocation with a random UUID (should fail)
  const randomSessionId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();
  await TestValidator.error(
    "reading revocation with random sessionId as authenticated (likely revoked) user should fail",
    async () => {
      await api.functional.todoApp.todoUser.sessions.revocation.at(connection, {
        sessionId: randomSessionId,
      });
    },
  );

  // 5) Unauthenticated connection must also fail
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "reading revocation unauthenticated should fail",
    async () => {
      await api.functional.todoApp.todoUser.sessions.revocation.at(unauthConn, {
        sessionId: randomSessionId,
      });
    },
  );
}
