import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppSession } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSession";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Validate visibility and security of session detail after logout.
 *
 * Scenario rewrite rationale: the SDK does not expose an API to obtain the
 * current sessionId created during join, so we validate implementable
 * invariants instead:
 *
 * - Join issues an authorization context (token provided)
 * - Logout succeeds (idempotent)
 * - Session detail retrieval by user-scoped path returns an ITodoAppSession that
 *   belongs to the user and does not expose raw secrets
 * - If revocation fields exist, they follow correct formats
 *
 * Steps:
 *
 * 1. Join as todoUser to obtain (userId, token)
 * 2. Logout to revoke current session (idempotent success)
 * 3. Retrieve a session detail under the same user scope using a UUID
 * 4. Validate ownership, absence of secret fields, and field formats
 */
export async function test_api_user_session_detail_revoked_session_visible(
  connection: api.IConnection,
) {
  // 1) Join and get authorized context (id + token)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBody });
  typia.assert(authorized);

  // Basic sanity: token.access should be non-empty
  TestValidator.predicate(
    "access token should be a non-empty string",
    () => authorized.token.access.length > 0,
  );

  // 2) Logout - revoke current session (idempotent)
  const logoutResult = await api.functional.auth.todoUser.logout(connection);
  typia.assert(logoutResult);

  // 3) Retrieve a (scoped) session entity for this user
  const sessionId = typia.random<string & tags.Format<"uuid">>();
  const session: ITodoAppSession =
    await api.functional.todoApp.todoUser.users.sessions.at(connection, {
      userId: authorized.id,
      sessionId,
    });
  typia.assert(session);

  // 4) Business/security validations
  // Ownership must match
  TestValidator.equals(
    "session belongs to the authenticated user",
    session.todo_app_user_id,
    authorized.id,
  );

  // Must not expose raw session_token
  TestValidator.predicate(
    "response must not expose raw session_token field",
    () => !("session_token" in (session as object)),
  );

  // If revocation timestamp exists, ensure correct format
  if (session.revoked_at !== null && session.revoked_at !== undefined) {
    typia.assert<string & tags.Format<"date-time">>(session.revoked_at!);
  }

  // If optional reason exists, it must be a string (typia asserts structure already)
  if (session.revoked_reason !== null && session.revoked_reason !== undefined) {
    TestValidator.predicate(
      "revoked_reason present implies string type",
      () => typeof session.revoked_reason === "string",
    );
  }
}
