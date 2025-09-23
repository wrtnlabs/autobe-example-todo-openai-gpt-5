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
 * Validate successful login right after registration, and verify login attempt
 * recording.
 *
 * Workflow:
 *
 * 1. Register a new todoUser via /auth/todoUser/join with ITodoAppTodoUser.ICreate
 * 2. Login using /auth/todoUser/login with ITodoAppTodoUserLogin.IRequest
 * 3. List login attempts via /todoApp/todoUser/users/{userId}/loginAttempts and
 *    confirm a success record
 *
 * Validations:
 *
 * - Tokens present and non-empty (access, refresh); expiration timestamps are in
 *   the future
 * - Login user id equals the registered user id
 * - Login attempts contain a success record for the email with recent occurred_at
 */
export async function test_api_todo_user_login_success_after_registration(
  connection: api.IConnection,
) {
  // 1) Register a new todoUser
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12);

  const joinBody = {
    email,
    password,
  } satisfies ITodoAppTodoUser.ICreate;

  const joined = await api.functional.auth.todoUser.join(connection, {
    body: joinBody,
  });
  typia.assert(joined);

  // Token checks after join
  TestValidator.predicate(
    "join: access token should be non-empty",
    joined.token.access.length > 0,
  );
  TestValidator.predicate(
    "join: refresh token should be non-empty",
    joined.token.refresh.length > 0,
  );
  const now = new Date();
  const accessExp = new Date(joined.token.expired_at);
  const refreshExp = new Date(joined.token.refreshable_until);
  TestValidator.predicate(
    "join: access token expiration must be in the future",
    accessExp.getTime() > now.getTime(),
  );
  TestValidator.predicate(
    "join: refresh token expiration must be in the future",
    refreshExp.getTime() > now.getTime(),
  );

  // 2) Login with the same credentials
  const loginBody = {
    email,
    password,
    keep_me_signed_in: true,
  } satisfies ITodoAppTodoUserLogin.IRequest;

  const authorized = await api.functional.auth.todoUser.login(connection, {
    body: loginBody,
  });
  typia.assert(authorized);

  // Ensure login references the same subject id
  TestValidator.equals(
    "login: authorized id must equal joined user id",
    authorized.id,
    joined.id,
  );

  // Token checks after login
  TestValidator.predicate(
    "login: access token should be non-empty",
    authorized.token.access.length > 0,
  );
  TestValidator.predicate(
    "login: refresh token should be non-empty",
    authorized.token.refresh.length > 0,
  );

  // 3) Verify login attempts list contains a success record for the email, recently
  const occurredFrom = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const listBody = {
    page: 1,
    limit: 10,
    success: true,
    email,
    occurred_from: occurredFrom,
    sort_by: "occurred_at",
    sort_dir: "desc",
  } satisfies ITodoAppLoginAttempt.IRequest;

  const attemptsPage =
    await api.functional.todoApp.todoUser.users.loginAttempts.index(
      connection,
      {
        userId: authorized.id,
        body: listBody,
      },
    );
  typia.assert(attemptsPage);

  const found = attemptsPage.data.find(
    (a) => a.email === email && a.success === true,
  );
  TestValidator.predicate(
    "login attempts: must contain a success record for the email",
    found !== undefined,
  );
  if (found) {
    typia.assertGuard<ITodoAppLoginAttempt.ISummary>(found);
    TestValidator.equals(
      "login attempts: email matches the login email",
      found.email,
      email,
    );
    TestValidator.predicate(
      "login attempts: success flag should be true",
      found.success === true,
    );
    const occurredAt = new Date(found.occurred_at).getTime();
    const bound = new Date(occurredFrom).getTime();
    TestValidator.predicate(
      "login attempts: occurred_at should be >= occurred_from bound",
      occurredAt >= bound,
    );
  }
}
