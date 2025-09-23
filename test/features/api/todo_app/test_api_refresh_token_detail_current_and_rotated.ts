import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppRefreshToken } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppRefreshToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppTodoUserRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserRefresh";

export async function test_api_refresh_token_detail_current_and_rotated(
  connection: api.IConnection,
) {
  // 1) Join: create a member with initial session and refresh token RT0
  const joinBody = typia.random<ITodoAppTodoUser.ICreate>();
  const auth0: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBody });
  typia.assert(auth0);

  // Keep original tokens
  const access0: string = auth0.token.access;
  const rt0: string = auth0.token.refresh;

  // 2) Smoke-test: while authenticated, call detail endpoint with UUIDs
  //    (Exact IDs are not exposed by APIs; this is a schema & auth smoke-test)
  const tokenMeta0: ITodoAppRefreshToken =
    await api.functional.todoApp.todoUser.sessions.refreshTokens.at(
      connection,
      {
        sessionId: typia.random<string & tags.Format<"uuid">>(),
        refreshTokenId: typia.random<string & tags.Format<"uuid">>(),
      },
    );
  typia.assert(tokenMeta0);

  // 3) Refresh with RT0 → produces new token pair; previous token is rotated
  const refreshBody1 = {
    refresh_token: rt0,
  } satisfies ITodoAppTodoUserRefresh.IRequest;
  const auth1: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.refresh(connection, {
      body: refreshBody1,
    });
  typia.assert(auth1);

  // Rotation validation: access and refresh should change
  TestValidator.notEquals(
    "access token rotated (new != old)",
    auth1.token.access,
    access0,
  );
  TestValidator.notEquals(
    "refresh token rotated (new != old)",
    auth1.token.refresh,
    rt0,
  );

  // 4) Error path: reusing RT0 must fail (already rotated)
  await TestValidator.error(
    "cannot refresh again with rotated (old) refresh token",
    async () => {
      await api.functional.auth.todoUser.refresh(connection, {
        body: { refresh_token: rt0 } satisfies ITodoAppTodoUserRefresh.IRequest,
      });
    },
  );

  // 5) Additional smoke-test: detail endpoint call still works while authenticated
  const tokenMeta1: ITodoAppRefreshToken =
    await api.functional.todoApp.todoUser.sessions.refreshTokens.at(
      connection,
      {
        sessionId: typia.random<string & tags.Format<"uuid">>(),
        refreshTokenId: typia.random<string & tags.Format<"uuid">>(),
      },
    );
  typia.assert(tokenMeta1);

  // 6) Logout current session; subsequent protected calls should fail
  await api.functional.auth.todoUser.logout(connection);

  await TestValidator.error(
    "refusing refresh-token detail after logout",
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
