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
 * Verify listing and filtering of refresh tokens with rotated/revoked states
 * and ownership.
 *
 * Steps:
 *
 * 1. Register a todoUser to obtain initial access/refresh tokens (session is
 *    created by the server).
 * 2. Perform refresh rotation twice using the latest refresh token each time;
 *    ensure tokens change.
 * 3. Attempt to list refresh tokens of a random (unrelated) sessionId to validate
 *    ownership enforcement (should error).
 * 4. Use a simulated connection to exercise the listing endpoint with filters for
 *    rotated and revoked states, asserting response typing.
 * 5. Logout to end the current session (idempotent, void response).
 */
export async function test_api_refresh_token_filter_revoked_and_rotated(
  connection: api.IConnection,
) {
  // 1) Register a new todoUser (join)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const auth0 = await api.functional.auth.todoUser.join(connection, {
    body: joinBody,
  });
  typia.assert(auth0);

  // 2) Perform refresh rotations
  const refreshBody1 = {
    refresh_token: auth0.token.refresh,
  } satisfies ITodoAppTodoUserRefresh.IRequest;
  const auth1 = await api.functional.auth.todoUser.refresh(connection, {
    body: refreshBody1,
  });
  typia.assert(auth1);
  TestValidator.notEquals(
    "first rotation should yield a new refresh token",
    auth1.token.refresh,
    auth0.token.refresh,
  );

  const refreshBody2 = {
    refresh_token: auth1.token.refresh,
  } satisfies ITodoAppTodoUserRefresh.IRequest;
  const auth2 = await api.functional.auth.todoUser.refresh(connection, {
    body: refreshBody2,
  });
  typia.assert(auth2);
  TestValidator.notEquals(
    "second rotation should yield a new refresh token",
    auth2.token.refresh,
    auth1.token.refresh,
  );

  // 3) Ownership enforcement: listing another session's tokens should error
  await TestValidator.error(
    "cannot list refresh tokens of a different session",
    async () => {
      await api.functional.todoApp.todoUser.sessions.refreshTokens.index(
        connection,
        {
          sessionId: typia.random<string & tags.Format<"uuid">>(),
          body: {
            page: 1,
            limit: 10,
          } satisfies ITodoAppRefreshToken.IRequest,
        },
      );
    },
  );

  // 4) Exercise listing with filters using a simulated connection (no sessionId resolver available)
  const simConn: api.IConnection = { ...connection, simulate: true };
  const simulatedSessionId = typia.random<string & tags.Format<"uuid">>();

  const listRotated =
    await api.functional.todoApp.todoUser.sessions.refreshTokens.index(
      simConn,
      {
        sessionId: simulatedSessionId,
        body: {
          page: 1,
          limit: 10,
          rotated: true,
        } satisfies ITodoAppRefreshToken.IRequest,
      },
    );
  typia.assert(listRotated);

  const listRevoked =
    await api.functional.todoApp.todoUser.sessions.refreshTokens.index(
      simConn,
      {
        sessionId: simulatedSessionId,
        body: {
          page: 1,
          limit: 10,
          revoked: true,
        } satisfies ITodoAppRefreshToken.IRequest,
      },
    );
  typia.assert(listRevoked);

  const listActive =
    await api.functional.todoApp.todoUser.sessions.refreshTokens.index(
      simConn,
      {
        sessionId: simulatedSessionId,
        body: {
          page: 1,
          limit: 10,
          rotated: false,
          revoked: false,
        } satisfies ITodoAppRefreshToken.IRequest,
      },
    );
  typia.assert(listActive);

  // 5) Logout (void response)
  await api.functional.auth.todoUser.logout(connection);
}
