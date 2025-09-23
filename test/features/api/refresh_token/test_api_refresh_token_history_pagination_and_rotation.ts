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

export async function test_api_refresh_token_history_pagination_and_rotation(
  connection: api.IConnection,
) {
  /**
   * Validate refresh token rotation and secured listing for a todoUser session.
   *
   * Steps:
   *
   * 1. Join a new todoUser and obtain initial access/refresh tokens.
   * 2. Rotate refresh token multiple times and verify each rotation changes both
   *    tokens.
   * 3. Attempt to list refresh tokens for a foreign session (random UUID) with
   *    pagination and sorting to verify access control is enforced.
   */
  // 1) Join a new member (todoUser)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const me1 = await api.functional.auth.todoUser.join(connection, {
    body: joinBody,
  });
  typia.assert(me1);

  // 2) Perform multiple refresh rotations and verify tokens change every time
  let prevAccess: string = me1.token.access;
  let prevRefresh: string = me1.token.refresh;

  for (let i = 1; i <= 3; i++) {
    const refreshBody = {
      refresh_token: prevRefresh,
    } satisfies ITodoAppTodoUserRefresh.IRequest;

    const refreshed = await api.functional.auth.todoUser.refresh(connection, {
      body: refreshBody,
    });
    typia.assert(refreshed);

    // Assert access token changed
    TestValidator.notEquals(
      `rotation #${i} - access token should change`,
      refreshed.token.access,
      prevAccess,
    );
    // Assert refresh token changed
    TestValidator.notEquals(
      `rotation #${i} - refresh token should change`,
      refreshed.token.refresh,
      prevRefresh,
    );

    prevAccess = refreshed.token.access;
    prevRefresh = refreshed.token.refresh;
  }

  // 3) Access control check for refresh tokens listing: attempt foreign session
  const foreignSessionId = typia.random<string & tags.Format<"uuid">>();
  const listBody = {
    page: 1,
    limit: 2,
    sort_by: "issued_at",
    sort_dir: "desc",
  } satisfies ITodoAppRefreshToken.IRequest;

  await TestValidator.error(
    "cannot list refresh tokens of a foreign session",
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
