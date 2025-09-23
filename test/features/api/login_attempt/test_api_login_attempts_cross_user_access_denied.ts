import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ELoginAttemptSortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/ELoginAttemptSortBy";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppLoginAttempt } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppLoginAttempt";
import type { ITodoAppLoginAttempt } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppLoginAttempt";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppTodoUserLogin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserLogin";

/**
 * Ensure cross-user access to login attempts is denied while self-access works.
 *
 * Business flow:
 *
 * 1. Create User A (join) with known credentials.
 * 2. Generate multiple login attempts for User A: two failed (wrong password) and
 *    one successful.
 * 3. Create User B (join) which authenticates as B.
 * 4. While authenticated as B, attempt to search A's login attempts and expect an
 *    error.
 * 5. Re-authenticate as A and successfully search A's own login attempts.
 *
 * Notes:
 *
 * - No HTTP status code assertions; only presence/absence of errors.
 * - All request bodies use satisfies with correct DTO variants.
 * - SDK handles Authorization tokens; never touch connection.headers.
 */
export async function test_api_login_attempts_cross_user_access_denied(
  connection: api.IConnection,
) {
  // 1) Create User A with deterministic credentials for later logins
  const emailA = typia.random<string & tags.Format<"email">>();
  const passwordA = typia.random<
    string & tags.MinLength<8> & tags.MaxLength<64>
  >();
  const joinABody = {
    email: emailA,
    password: passwordA,
  } satisfies ITodoAppTodoUser.ICreate;
  const authorizedA = await api.functional.auth.todoUser.join(connection, {
    body: joinABody,
  });
  typia.assert(authorizedA);

  // 2) Generate login attempts for A: two failed, one successful
  const wrongPasswordA = typia.random<
    string & tags.MinLength<8> & tags.MaxLength<64>
  >();
  await TestValidator.error(
    "failed login attempt #1 must be recorded (business error)",
    async () => {
      await api.functional.auth.todoUser.login(connection, {
        body: {
          email: emailA,
          password: wrongPasswordA,
        } satisfies ITodoAppTodoUserLogin.IRequest,
      });
    },
  );
  await TestValidator.error(
    "failed login attempt #2 must be recorded (business error)",
    async () => {
      await api.functional.auth.todoUser.login(connection, {
        body: {
          email: emailA,
          password: wrongPasswordA,
        } satisfies ITodoAppTodoUserLogin.IRequest,
      });
    },
  );
  const reauthA = await api.functional.auth.todoUser.login(connection, {
    body: {
      email: emailA,
      password: passwordA,
    } satisfies ITodoAppTodoUserLogin.IRequest,
  });
  typia.assert(reauthA);

  // 3) Create User B (join) and authenticate as B
  const emailB = typia.random<string & tags.Format<"email">>();
  const passwordB = typia.random<
    string & tags.MinLength<8> & tags.MaxLength<64>
  >();
  const joinBBody = {
    email: emailB,
    password: passwordB,
  } satisfies ITodoAppTodoUser.ICreate;
  const authorizedB = await api.functional.auth.todoUser.join(connection, {
    body: joinBBody,
  });
  typia.assert(authorizedB);

  // Sanity: different identities
  TestValidator.notEquals(
    "user A and user B must be different ids",
    authorizedA.id,
    authorizedB.id,
  );

  // 4) While authenticated as B, accessing A's attempts must fail
  const crossAccessRequest = {
    // keep request minimal; filters are optional
  } satisfies ITodoAppLoginAttempt.IRequest;
  await TestValidator.error(
    "cross-user access (B → A) to login attempts must be denied",
    async () => {
      await api.functional.todoApp.todoUser.users.loginAttempts.index(
        connection,
        {
          userId: authorizedA.id,
          body: crossAccessRequest,
        },
      );
    },
  );

  // 5) Re-authenticate as A and list own attempts successfully
  const reloginA = await api.functional.auth.todoUser.login(connection, {
    body: {
      email: emailA,
      password: passwordA,
    } satisfies ITodoAppTodoUserLogin.IRequest,
  });
  typia.assert(reloginA);

  const selfAccessRequest = {
    // may leave empty or fine-tune (e.g., limit/page) — optional
  } satisfies ITodoAppLoginAttempt.IRequest;
  const pageA = await api.functional.todoApp.todoUser.users.loginAttempts.index(
    connection,
    {
      userId: authorizedA.id,
      body: selfAccessRequest,
    },
  );
  typia.assert(pageA);
}
