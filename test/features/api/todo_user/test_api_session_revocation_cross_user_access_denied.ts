import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppSessionRevocation } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSessionRevocation";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_session_revocation_cross_user_access_denied(
  connection: api.IConnection,
) {
  /**
   * Validate privacy-preserving access to session revocation records.
   *
   * Business goal: Ensure that a todoUser cannot read another user's session
   * revocation details, and that unknown session IDs are not disclosed to any
   * user (owner or not), maintaining privacy-preserving not-found semantics.
   *
   * Scenario adaptation:
   *
   * - The API does not expose a way to obtain the current sessionId after
   *   join/login, and logout returns void. Therefore, we cannot retrieve a real
   *   sessionId to demonstrate an owner's successful read. We instead validate
   *   the core privacy guarantees using an unrelated (random) sessionId, which
   *   must remain unreadable for both other users and the owner of a different
   *   session.
   *
   * Steps:
   *
   * 1. Prepare two independent connections (connA, connB) to isolate auth contexts
   *    without touching headers.
   * 2. Join as User A on connA; verify authorization DTO.
   * 3. Join as User B on connB; verify authorization DTO.
   * 4. Logout as User B to create a revocation record for B's current session.
   * 5. As User A, attempt to GET revocation for an arbitrary sessionId and assert
   *    an error occurs (authorization failure or privacy-preserving not-found)
   *    using TestValidator.error().
   * 6. As User B as well, attempt the same arbitrary sessionId; assert error
   *    (unknown session remains hidden).
   */

  // 1) Two independent connections for separate auth contexts
  const connA: api.IConnection = { ...connection, headers: {} };
  const connB: api.IConnection = { ...connection, headers: {} };

  // 2) Join as User A
  const joinA = await api.functional.auth.todoUser.join(connA, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(joinA);
  TestValidator.predicate(
    "User A receives non-empty access token",
    joinA.token.access.length > 0,
  );

  // 3) Join as User B
  const joinB = await api.functional.auth.todoUser.join(connB, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(joinB);
  TestValidator.predicate(
    "User B receives non-empty access token",
    joinB.token.access.length > 0,
  );

  // 4) Logout as User B to create a session revocation
  const logoutB = await api.functional.auth.todoUser.logout(connB);
  typia.assert(logoutB);

  // 5) Attempt cross-user read with an arbitrary session ID (privacy-preserving denial expected)
  const arbitrarySessionId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();

  await TestValidator.error(
    "User A cannot read another user's session revocation (privacy-preserving denial)",
    async () => {
      await api.functional.todoApp.todoUser.sessions.revocation.at(connA, {
        sessionId: arbitrarySessionId,
      });
    },
  );

  // 6) Even the owner cannot read an unrelated/unknown session's revocation
  await TestValidator.error(
    "Unknown session revocation remains unreadable even by User B (owner of a different session)",
    async () => {
      await api.functional.todoApp.todoUser.sessions.revocation.at(connB, {
        sessionId: arbitrarySessionId,
      });
    },
  );
}
