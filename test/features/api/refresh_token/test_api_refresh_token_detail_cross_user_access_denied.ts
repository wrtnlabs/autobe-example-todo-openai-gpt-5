import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppRefreshToken } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppRefreshToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppTodoUserRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserRefresh";

/**
 * Cross-user access to refresh token details must be denied.
 *
 * This test ensures a member (todoUser) cannot read or rotate another user's
 * refresh tokens. It follows a minimal yet realistic flow:
 *
 * 1. Register User A and obtain A's refresh token; rotate once to exercise
 *    lifecycle.
 * 2. Register User B to switch the SDK context to B (Authorization handled
 *    automatically).
 * 3. As User B, attempt to GET a refresh token detail by (unknown) IDs → expect
 *    error.
 * 4. As User B, attempt to refresh using User A's refresh token string → expect
 *    error.
 *
 * Note: No API exposes sessionId/refreshTokenId, so we cannot build a
 * guaranteed successful owner retrieval call. The test targets denial semantics
 * only.
 */
export async function test_api_refresh_token_detail_cross_user_access_denied(
  connection: api.IConnection,
) {
  // 1) Register User A
  const userABody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const authA: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: userABody });
  typia.assert(authA);

  // Keep A's refresh token and rotate once
  const aRefresh1: string = authA.token.refresh;
  const authA2: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.refresh(connection, {
      body: {
        refresh_token: aRefresh1,
      } satisfies ITodoAppTodoUserRefresh.IRequest,
    });
  typia.assert(authA2);
  const aRefresh2: string = authA2.token.refresh;

  // 2) Register User B (SDK sets Authorization to B)
  const userBBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const authB: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: userBBody });
  typia.assert(authB);

  // Confirm distinct users
  TestValidator.notEquals(
    "User A and User B must have different ids",
    authA.id,
    authB.id,
  );

  // 3) As User B, attempt to fetch refresh token detail with arbitrary UUIDs
  const unknownSessionId = typia.random<string & tags.Format<"uuid">>();
  const unknownRefreshTokenId = typia.random<string & tags.Format<"uuid">>();
  await TestValidator.error(
    "cross-user or unknown refresh token detail must be denied",
    async () => {
      await api.functional.todoApp.todoUser.sessions.refreshTokens.at(
        connection,
        { sessionId: unknownSessionId, refreshTokenId: unknownRefreshTokenId },
      );
    },
  );

  // 4) As User B, attempt to refresh using A's refresh token → must fail
  await TestValidator.error(
    "cannot refresh using another user's refresh token",
    async () => {
      await api.functional.auth.todoUser.refresh(connection, {
        body: {
          refresh_token: aRefresh2,
        } satisfies ITodoAppTodoUserRefresh.IRequest,
      });
    },
  );
}
