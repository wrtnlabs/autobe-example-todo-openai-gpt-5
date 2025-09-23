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
 * Verify login failure on incorrect password and audit logging of the attempt.
 *
 * This scenario ensures that when a member (todoUser) attempts to log in with
 * an invalid password, the authentication fails and the event is recorded as a
 * failed login attempt. The authenticated user can later review their own login
 * attempts and confirm that the failure was logged.
 *
 * Steps:
 *
 * 1. Register a new todoUser via /auth/todoUser/join and capture email/password.
 * 2. Attempt to login with the same email but an incorrect password on a fresh
 *    unauthenticated connection and expect an error.
 * 3. Using the authorized connection from join, list login attempts via
 *    /todoApp/todoUser/users/{userId}/loginAttempts with filters success=false
 *    and email=<joined email>, sorted by occurred_at desc.
 * 4. Validate that the latest record exists and has success=false with the same
 *    email.
 */
export async function test_api_todo_user_login_invalid_password(
  connection: api.IConnection,
) {
  // 1) Register a new user (setup)
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12);

  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: {
      email,
      password,
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authorized);

  // Prepare a wrong password different from the true password
  let wrongPassword: string = RandomGenerator.alphaNumeric(12);
  if (wrongPassword === password) wrongPassword = `${wrongPassword}_x`;

  // 2) Attempt login with wrong password on an unauthenticated connection
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "login with incorrect password must fail",
    async () => {
      await api.functional.auth.todoUser.login(unauthConn, {
        body: {
          email,
          password: wrongPassword,
        } satisfies ITodoAppTodoUserLogin.IRequest,
      });
    },
  );

  // 3) List login attempts for the user to confirm failure was recorded
  const page = await api.functional.todoApp.todoUser.users.loginAttempts.index(
    connection,
    {
      userId: authorized.id,
      body: {
        page: 1,
        limit: 10,
        success: false,
        email,
        sort_by: "occurred_at",
        sort_dir: "desc",
      } satisfies ITodoAppLoginAttempt.IRequest,
    },
  );
  typia.assert(page);

  // 4) Validate that the latest attempt is a failure for the same email
  TestValidator.predicate(
    "at least one failed login attempt is listed",
    page.data.length > 0,
  );
  const latest = page.data[0];
  TestValidator.equals(
    "latest attempt success flag is false",
    latest.success,
    false,
  );
  TestValidator.equals(
    "latest attempt email matches the joined email",
    latest.email,
    email,
  );
}
