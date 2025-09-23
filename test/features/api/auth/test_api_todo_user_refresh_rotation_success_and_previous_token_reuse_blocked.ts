import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppTodoUserRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserRefresh";

/**
 * Verify refresh token rotation for todoUser: success on first refresh, and
 * reject reuse of the rotated (old) refresh token.
 *
 * Steps:
 *
 * 1. Register a new todoUser and get initial access/refresh tokens
 * 2. Refresh using the initial refresh token -> should succeed and rotate tokens
 * 3. Attempt to refresh again with the old token -> should fail (single-use)
 * 4. Optionally ensure continuity by refreshing again with the new token
 */
export async function test_api_todo_user_refresh_rotation_success_and_previous_token_reuse_blocked(
  connection: api.IConnection,
) {
  // 1) Register a new todoUser and capture tokens
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const auth1 = await api.functional.auth.todoUser.join(connection, {
    body: joinBody,
  });
  typia.assert(auth1);

  const initialUserId: string = auth1.id;
  const initialAccess: string = auth1.token.access;
  const initialRefresh: string = auth1.token.refresh;

  // 2) Perform refresh with the initial refresh token
  const refreshReq1 = {
    refresh_token: initialRefresh,
  } satisfies ITodoAppTodoUserRefresh.IRequest;
  const auth2 = await api.functional.auth.todoUser.refresh(connection, {
    body: refreshReq1,
  });
  typia.assert(auth2);

  // Validate rotation effects
  TestValidator.equals(
    "user id remains constant across refresh",
    auth2.id,
    initialUserId,
  );
  TestValidator.notEquals(
    "refresh rotation returns a different refresh token",
    auth2.token.refresh,
    initialRefresh,
  );
  TestValidator.notEquals(
    "access token is renewed on refresh",
    auth2.token.access,
    initialAccess,
  );

  // 3) Reuse the old refresh token -> must fail
  await TestValidator.error(
    "reusing a rotated refresh token must be rejected",
    async () => {
      await api.functional.auth.todoUser.refresh(connection, {
        body: {
          refresh_token: initialRefresh,
        } satisfies ITodoAppTodoUserRefresh.IRequest,
      });
    },
  );

  // 4) Refresh again with newly issued token to verify continuity
  const refreshReq2 = {
    refresh_token: auth2.token.refresh,
  } satisfies ITodoAppTodoUserRefresh.IRequest;
  const auth3 = await api.functional.auth.todoUser.refresh(connection, {
    body: refreshReq2,
  });
  typia.assert(auth3);

  TestValidator.equals(
    "user id remains constant after second refresh",
    auth3.id,
    initialUserId,
  );
  TestValidator.notEquals(
    "second refresh issues a new refresh token again",
    auth3.token.refresh,
    auth2.token.refresh,
  );
  TestValidator.notEquals(
    "second refresh rotates access token again",
    auth3.token.access,
    auth2.token.access,
  );
}
