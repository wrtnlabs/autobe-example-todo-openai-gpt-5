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
 * Validate owner can access own login attempt detail and permission boundaries.
 *
 * Steps:
 *
 * 1. Create owner via join and capture id/email/password
 * 2. Attempt login with wrong password (expect error) to generate failed attempt
 * 3. Login with correct password (success)
 * 4. List attempts (occurred_at desc) and pick latest id
 * 5. Get detail by id and validate integrity and business rules
 * 6. Negative tests: unauthenticated access, non-existent id, cross-user access
 */
export async function test_api_login_attempt_detail_owner_access(
  connection: api.IConnection,
) {
  // 1) Create owner
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12);
  const owner: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email,
        password,
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(owner);

  // 2) Wrong password login to generate a failed attempt (expect error)
  await TestValidator.error(
    "login with wrong password should fail and be audited",
    async () => {
      await api.functional.auth.todoUser.login(connection, {
        body: {
          email,
          password: password + "x",
          keep_me_signed_in: true,
        } satisfies ITodoAppTodoUserLogin.IRequest,
      });
    },
  );

  // 3) Correct login to create a success attempt
  const reAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.login(connection, {
      body: {
        email,
        password,
      } satisfies ITodoAppTodoUserLogin.IRequest,
    });
  typia.assert(reAuth);
  TestValidator.equals(
    "re-auth subject id should equal owner id",
    reAuth.id,
    owner.id,
  );

  // 4) List attempts for owner, sorted by occurred_at desc
  const page: IPageITodoAppLoginAttempt.ISummary =
    await api.functional.todoApp.todoUser.users.loginAttempts.index(
      connection,
      {
        userId: owner.id,
        body: {
          page: 1,
          limit: 10,
          sort_by: "occurred_at",
          sort_dir: "desc",
        } satisfies ITodoAppLoginAttempt.IRequest,
      },
    );
  typia.assert(page);
  TestValidator.predicate(
    "login attempts list should contain at least one record",
    page.data.length > 0,
  );

  const latestSummary: ITodoAppLoginAttempt.ISummary = page.data[0]!;

  // 5) Fetch detail and validate
  const detail: ITodoAppLoginAttempt =
    await api.functional.todoApp.todoUser.users.loginAttempts.at(connection, {
      userId: owner.id,
      loginAttemptId: latestSummary.id,
    });
  typia.assert(detail);

  // Equality checks against summary
  TestValidator.equals(
    "detail.id equals summary.id",
    detail.id,
    latestSummary.id,
  );
  TestValidator.equals(
    "detail.email equals summary.email",
    detail.email,
    latestSummary.email,
  );
  TestValidator.equals(
    "detail.success equals summary.success",
    detail.success,
    latestSummary.success,
  );
  TestValidator.equals(
    "detail.occurred_at equals summary.occurred_at",
    detail.occurred_at,
    latestSummary.occurred_at,
  );

  // Presence checks and conditional rules
  TestValidator.predicate(
    "ip should be a non-empty string",
    detail.ip.length > 0,
  );
  if (detail.user_agent !== null && detail.user_agent !== undefined)
    TestValidator.predicate(
      "user_agent, when present, should be non-empty",
      detail.user_agent.length > 0,
    );

  if (detail.success === true) {
    TestValidator.equals(
      "failure_reason should be empty on success",
      detail.failure_reason,
      null,
    );
  } else {
    TestValidator.predicate(
      "failure_reason should be provided on failure",
      detail.failure_reason !== null &&
        detail.failure_reason !== undefined &&
        detail.failure_reason.length > 0,
    );
  }

  if (detail.todo_app_user_id !== null && detail.todo_app_user_id !== undefined)
    TestValidator.equals(
      "owned attempt should link to owner.id",
      detail.todo_app_user_id,
      owner.id,
    );

  // 6) Negative/permission scenarios
  // 6-1) Unauthenticated access should be rejected
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated user cannot access attempt detail",
    async () => {
      await api.functional.todoApp.todoUser.users.loginAttempts.at(unauthConn, {
        userId: owner.id,
        loginAttemptId: latestSummary.id,
      });
    },
  );

  // 6-2) Non-existent id should not be retrievable
  const randomOtherId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();
  await TestValidator.error(
    "non-existent loginAttemptId should not be found",
    async () => {
      await api.functional.todoApp.todoUser.users.loginAttempts.at(connection, {
        userId: owner.id,
        loginAttemptId: randomOtherId,
      });
    },
  );

  // 6-3) Cross-user access should be denied
  const otherEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const otherPassword: string = RandomGenerator.alphaNumeric(12);
  const otherUser: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email: otherEmail,
        password: otherPassword,
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(otherUser);
  await TestValidator.error(
    "another user cannot access owner's attempt detail",
    async () => {
      await api.functional.todoApp.todoUser.users.loginAttempts.at(connection, {
        userId: owner.id,
        loginAttemptId: latestSummary.id,
      });
    },
  );
}
