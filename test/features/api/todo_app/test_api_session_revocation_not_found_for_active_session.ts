import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppSessionRevocation } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSessionRevocation";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Validate "not-found style" behavior for session revocation when session is
 * active.
 *
 * Business context:
 *
 * - A freshly joined todoUser has an active session and no revocation record.
 * - Querying the revocation record by sessionId should fail (service-level
 *   not-found) when no revocation exists.
 *
 * Steps:
 *
 * 1. Register a new todoUser (join) to become authenticated.
 * 2. While authenticated, call GET
 *    /todoApp/todoUser/sessions/{sessionId}/revocation with a random UUID.
 * 3. Expect an error (not-found behavior); do not assert HTTP status or error
 *    message.
 */
export async function test_api_session_revocation_not_found_for_active_session(
  connection: api.IConnection,
) {
  // 1) Register and authenticate a new todoUser
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBody });
  typia.assert(authorized);

  // 2) Attempt to fetch a revocation record for a random session UUID
  const randomSessionId = typia.random<string & tags.Format<"uuid">>();
  await TestValidator.error(
    "revocation lookup should fail for non-revoked/non-existent session",
    async () => {
      await api.functional.todoApp.todoUser.sessions.revocation.at(connection, {
        sessionId: randomSessionId,
      });
    },
  );
}
