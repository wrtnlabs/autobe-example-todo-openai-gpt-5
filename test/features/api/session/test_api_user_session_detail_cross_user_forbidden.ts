import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppSession } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSession";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Cross-user access to session detail must be denied.
 *
 * Purpose:
 *
 * - Ensure a todoUser (User A) cannot fetch another user's (User B) session
 *   details.
 * - Validate owner-only access for GET
 *   /todoApp/todoUser/users/{userId}/sessions/{sessionId}.
 *
 * Strategy:
 *
 * 1. Create two independent authenticated users via join using two separate
 *    connection objects (connA for User A, connB for User B) to avoid
 *    token/header collisions.
 * 2. As User A, attempt to read User B's session with a syntactically valid but
 *    unknown sessionId.
 * 3. Expect denial (forbidden/not-found) without leaking existence in real server
 *    mode.
 * 4. In simulate mode, the SDK returns random data, so only assert type (skip
 *    denial expectation).
 */
export async function test_api_user_session_detail_cross_user_forbidden(
  connection: api.IConnection,
) {
  // Prepare independent connections for A and B without touching the original connection's headers
  const connA: api.IConnection = { ...connection, headers: {} };
  const connB: api.IConnection = { ...connection, headers: {} };

  // Create User A and authenticate connA
  const joinBodyA = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const authA: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connA, { body: joinBodyA });
  typia.assert(authA);

  // Create User B and authenticate connB
  const joinBodyB = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const authB: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connB, { body: joinBodyB });
  typia.assert(authB);

  // Sanity: IDs must differ
  TestValidator.notEquals(
    "two distinct users must be created",
    authA.id,
    authB.id,
  );

  // Use a syntactically valid but unknown sessionId to avoid relying on non-provided listing APIs
  const unknownSessionId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();

  if (connection.simulate === true) {
    // In simulate mode, SDK returns random ITodoAppSession even for cross-user attempts
    const fake: ITodoAppSession =
      await api.functional.todoApp.todoUser.users.sessions.at(connA, {
        userId: authB.id,
        sessionId: unknownSessionId,
      });
    typia.assert(fake);
  } else {
    // Real server: cross-user access must be denied (forbidden/not-found semantics)
    await TestValidator.error(
      "cross-user session detail must be denied",
      async () => {
        await api.functional.todoApp.todoUser.users.sessions.at(connA, {
          userId: authB.id,
          sessionId: unknownSessionId,
        });
      },
    );
  }
}
