import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { ITodoMvpSession } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpSession";
import type { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";

/**
 * Validate that an authenticated user cannot read a non-existent session.
 *
 * Business goal:
 *
 * - When a user is authenticated, requesting a session by a well-formed but
 *   non-existent UUID must fail without leaking sensitive information.
 *
 * Steps:
 *
 * 1. Register (join) a new user to establish authentication. SDK sets the
 *    Authorization header automatically.
 * 2. Generate a random, well-formed UUID that should not exist.
 * 3. Call the protected session detail endpoint with that UUID and expect an
 *    error. We do not assert specific HTTP status codes; only that an error
 *    occurs.
 *
 * Notes:
 *
 * - If running in SDK simulation mode, the simulator returns random success for
 *   any UUID; therefore, this negative test is skipped in that mode.
 */
export async function test_api_session_detail_user_not_found(
  connection: api.IConnection,
) {
  // Skip negative test when using SDK simulator (it returns random success)
  if (connection.simulate === true) return;

  // 1) Authenticate by joining a new user account
  const email = typia.random<string & tags.Format<"email">>();
  const password = RandomGenerator.alphaNumeric(12); // >= 8 chars per DTO
  const authorized = await api.functional.auth.user.join(connection, {
    body: {
      email,
      password,
    } satisfies ITodoMvpUser.ICreate,
  });
  typia.assert(authorized);

  // 2) Generate well-formed but non-existent UUID
  const missingSessionId = typia.random<string & tags.Format<"uuid">>();

  // 3) Expect error when fetching a non-existent session ID
  await TestValidator.error(
    "well-formed non-existent session id should cause an error",
    async () => {
      await api.functional.todoMvp.user.sessions.at(connection, {
        sessionId: missingSessionId,
      });
    },
  );
}
