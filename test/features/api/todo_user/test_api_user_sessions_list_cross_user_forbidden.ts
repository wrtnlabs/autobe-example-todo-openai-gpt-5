import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppSession } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppSession";
import type { ITodoAppSession } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSession";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Ensure a user cannot list another user's sessions (owner scoped).
 *
 * Flow:
 *
 * 1. Join as User A → keep this connection authenticated as A.
 * 2. Join as User B using an isolated connection to avoid replacing A's token.
 * 3. Positive control: A lists A's own sessions (should succeed).
 * 4. Negative: A attempts to list B's sessions (should be rejected).
 *
 * Validations:
 *
 * - A.id !== B.id
 * - Listing own sessions returns a valid page structure
 * - Cross-user attempt throws an error without leaking data
 */
export async function test_api_user_sessions_list_cross_user_forbidden(
  connection: api.IConnection,
) {
  // 1) Join as User A on the primary connection (token auto-installed)
  const joinABody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const userA: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinABody });
  typia.assert(userA);

  // 2) Join as User B on an isolated connection so A's headers are preserved
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  const joinBBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const userB: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(unauthConn, { body: joinBBody });
  typia.assert(userB);

  // Sanity: distinct users
  TestValidator.notEquals(
    "two distinct users should be created",
    userA.id,
    userB.id,
  );

  // 3) Positive control: User A lists own sessions successfully
  const ownPage: IPageITodoAppSession.ISummary =
    await api.functional.todoApp.todoUser.users.sessions.index(connection, {
      userId: userA.id,
      body: {} satisfies ITodoAppSession.IRequest,
    });
  typia.assert(ownPage);

  // 4) Negative: User A attempts to list User B's sessions → should error
  await TestValidator.error(
    "cross-user session listing should be forbidden",
    async () => {
      await api.functional.todoApp.todoUser.users.sessions.index(connection, {
        userId: userB.id,
        body: {} satisfies ITodoAppSession.IRequest,
      });
    },
  );
}
