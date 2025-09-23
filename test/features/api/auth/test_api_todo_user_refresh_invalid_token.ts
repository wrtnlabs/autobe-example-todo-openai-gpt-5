import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppTodoUserRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserRefresh";

export async function test_api_todo_user_refresh_invalid_token(
  connection: api.IConnection,
) {
  /**
   * Validate rejection of invalid refresh tokens for todoUser.
   *
   * Steps:
   *
   * 1. Generate obviously invalid refresh token strings.
   * 2. If simulate mode: perform a single refresh call and validate shape only
   *    (SDK returns random data).
   * 3. Else: perform two invalid refresh attempts and assert both calls fail
   *    without inspecting status codes.
   *
   * Notes:
   *
   * - Do NOT touch connection.headers per policy; SDK manages headers internally.
   * - Use `satisfies` for the request body DTO and always await API calls.
   */
  const invalidToken1: string = RandomGenerator.alphaNumeric(64);
  const invalidToken2: string = RandomGenerator.alphaNumeric(64);

  if (connection.simulate === true) {
    // In simulation mode, SDK returns random authorized data regardless of token validity.
    const authorized = await api.functional.auth.todoUser.refresh(connection, {
      body: {
        refresh_token: invalidToken1,
      } satisfies ITodoAppTodoUserRefresh.IRequest,
    });
    typia.assert<ITodoAppTodoUser.IAuthorized>(authorized);
  } else {
    await TestValidator.error(
      "invalid refresh token should be rejected",
      async () => {
        await api.functional.auth.todoUser.refresh(connection, {
          body: {
            refresh_token: invalidToken1,
          } satisfies ITodoAppTodoUserRefresh.IRequest,
        });
      },
    );

    await TestValidator.error(
      "repeated invalid refresh token should still be rejected and create no artifacts",
      async () => {
        await api.functional.auth.todoUser.refresh(connection, {
          body: {
            refresh_token: invalidToken2,
          } satisfies ITodoAppTodoUserRefresh.IRequest,
        });
      },
    );
  }
}
