import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ERefreshTokenSortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/ERefreshTokenSortBy";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppRefreshToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppRefreshToken";
import type { ITodoAppRefreshToken } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppRefreshToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppTodoUserRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserRefresh";

/**
 * Cross-user access to session refresh token listing must be denied.
 *
 * Business goal:
 *
 * - Ensure a user cannot enumerate another session's refresh tokens.
 * - Establish realistic rotation history by refreshing User A once.
 *
 * Notes on feasibility:
 *
 * - The SDK exposes no API to obtain a concrete sessionId for the current user.
 *   Therefore, we validate the authorization boundary by attempting a listing
 *   with a foreign (random) sessionId while authenticated as User B. The
 *   endpoint must not leak existence and should error.
 *
 * Steps:
 *
 * 1. Join User A and capture initial tokens.
 * 2. Refresh using User A's refresh token to create rotation history.
 * 3. Join User B to switch auth context.
 * 4. Attempt to list refresh tokens for a foreign sessionId as User B → expect
 *    error.
 */
export async function test_api_refresh_token_cross_user_access_denied(
  connection: api.IConnection,
) {
  // 1) Join User A
  const userABody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // 8-64 chars policy respected
  } satisfies ITodoAppTodoUser.ICreate;
  const userA = await api.functional.auth.todoUser.join(connection, {
    body: userABody,
  });
  typia.assert(userA);

  const aRefreshToken1: string = userA.token.refresh;

  // 2) Refresh for User A to create rotation history
  const refreshReqA = {
    refresh_token: aRefreshToken1,
  } satisfies ITodoAppTodoUserRefresh.IRequest;
  const userARefreshed = await api.functional.auth.todoUser.refresh(
    connection,
    {
      body: refreshReqA,
    },
  );
  typia.assert(userARefreshed);

  TestValidator.notEquals(
    "refresh rotation issues new refresh token for user A",
    userARefreshed.token.refresh,
    aRefreshToken1,
  );
  TestValidator.notEquals(
    "refresh rotation issues new access token for user A",
    userARefreshed.token.access,
    userA.token.access,
  );

  // 3) Join User B (switches Authorization via SDK side-effect)
  const userBBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const userB = await api.functional.auth.todoUser.join(connection, {
    body: userBBody,
  });
  typia.assert(userB);

  // 4) Attempt to list refresh tokens for a foreign session as User B → expect error
  const foreignSessionId = typia.random<string & tags.Format<"uuid">>();
  const listBody = {
    page: 1,
    limit: 10,
    sort_by: "issued_at",
    sort_dir: "desc",
  } satisfies ITodoAppRefreshToken.IRequest;

  await TestValidator.error(
    "cross-user access to session refresh token list should be denied",
    async () => {
      await api.functional.todoApp.todoUser.sessions.refreshTokens.index(
        connection,
        {
          sessionId: foreignSessionId,
          body: listBody,
        },
      );
    },
  );
}
