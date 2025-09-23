import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppRefreshToken } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppRefreshToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppTodoUserRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserRefresh";

/**
 * Ensure refresh token detail retrieval is blocked when session and token IDs
 * do not match.
 *
 * Business purpose:
 *
 * - A refresh token belongs to a specific session. The detail API must reject
 *   requests where sessionId and refreshTokenId are mismatched or non-existent,
 *   preventing cross-session data leakage.
 *
 * Flow (feasible subset with available APIs):
 *
 * 1. Register User A and rotate once to exercise token lifecycle.
 * 2. Register User B and rotate once to exercise token lifecycle and context
 *    switching.
 * 3. As User A, call GET with random (sessionId, refreshTokenId) → expect error.
 * 4. As User B, call GET with random (sessionId, refreshTokenId) → expect error.
 *
 * Notes:
 *
 * - Positive retrieval using real IDs is not implementable with the provided APIs
 *   because no endpoint exposes actual session or refresh token identifiers.
 *   Therefore this test focuses on the negative (not-found) behavior ensuring
 *   no leakage.
 */
export async function test_api_refresh_token_detail_session_mismatch_not_found(
  connection: api.IConnection,
) {
  // 1) Register User A and rotate once
  const joinBodyA = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const authA: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBodyA });
  typia.assert(authA);

  const refreshReqA1 = {
    refresh_token: authA.token.refresh,
  } satisfies ITodoAppTodoUserRefresh.IRequest;
  const refreshedA: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.refresh(connection, {
      body: refreshReqA1,
    });
  typia.assert(refreshedA);

  // 2) Register User B and rotate once (this also switches Authorization context to B)
  const joinBodyB = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const authB: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBodyB });
  typia.assert(authB);

  const refreshReqB1 = {
    refresh_token: authB.token.refresh,
  } satisfies ITodoAppTodoUserRefresh.IRequest;
  const refreshedB: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.refresh(connection, {
      body: refreshReqB1,
    });
  typia.assert(refreshedB);

  // 3) Switch back to User A context using its latest refresh token
  const refreshReqA2 = {
    refresh_token: refreshedA.token.refresh,
  } satisfies ITodoAppTodoUserRefresh.IRequest;
  const refreshedA2: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.refresh(connection, {
      body: refreshReqA2,
    });
  typia.assert(refreshedA2);

  // 3-a) As User A, attempt to retrieve with a mismatched/non-existent pair → expect error
  await TestValidator.error(
    "refresh token detail with mismatched IDs should fail (as user A)",
    async () => {
      await api.functional.todoApp.todoUser.sessions.refreshTokens.at(
        connection,
        {
          sessionId: typia.random<string & tags.Format<"uuid">>(),
          refreshTokenId: typia.random<string & tags.Format<"uuid">>(),
        },
      );
    },
  );

  // 4) Switch to User B context again using its latest refresh token
  const refreshReqB2 = {
    refresh_token: refreshedB.token.refresh,
  } satisfies ITodoAppTodoUserRefresh.IRequest;
  const refreshedB2: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.refresh(connection, {
      body: refreshReqB2,
    });
  typia.assert(refreshedB2);

  // 4-a) As User B, attempt to retrieve with a mismatched/non-existent pair → expect error
  await TestValidator.error(
    "refresh token detail with mismatched IDs should fail (as user B)",
    async () => {
      await api.functional.todoApp.todoUser.sessions.refreshTokens.at(
        connection,
        {
          sessionId: typia.random<string & tags.Format<"uuid">>(),
          refreshTokenId: typia.random<string & tags.Format<"uuid">>(),
        },
      );
    },
  );
}
