import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppSession } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppSession";
import type { ITodoAppPasswordChange } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPasswordChange";
import type { ITodoAppSession } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSession";
import type { ITodoAppSessionRevocation } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSessionRevocation";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppTodoUserLogin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserLogin";
import type { ITodoAppTodoUserPassword } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserPassword";

export async function test_api_password_change_revoke_others_sessions(
  connection: api.IConnection,
) {
  // 1) Register a new todoUser (session A on primary connection)
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const initialPassword: string = RandomGenerator.alphaNumeric(12);

  const joinOutput = await api.functional.auth.todoUser.join(connection, {
    body: {
      email,
      password: initialPassword,
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(joinOutput);
  const userId = joinOutput.id;

  // 2) Create another active session (session B) from a different client context
  //    Create a fresh connection with empty headers and login with the same credentials
  const otherConn: api.IConnection = { ...connection, headers: {} };
  const loginOutputB = await api.functional.auth.todoUser.login(otherConn, {
    body: {
      email,
      password: initialPassword,
      keep_me_signed_in: true,
    } satisfies ITodoAppTodoUserLogin.IRequest,
  });
  typia.assert(loginOutputB);

  // 3) Change password on session A and request revocation of other sessions
  const newPassword: string = RandomGenerator.alphaNumeric(14);
  const changeRes =
    await api.functional.auth.todoUser.password.change.changePassword(
      connection,
      {
        body: {
          currentPassword: initialPassword,
          newPassword,
          revokeOtherSessions: true,
        } satisfies ITodoAppTodoUserPassword.IChange,
      },
    );
  typia.assert(changeRes);
  TestValidator.predicate(
    "password change reports success",
    changeRes.success === true,
  );

  // 4) List sessions as the current user using session A
  //    If token was rotated/revoked by policy, re-login with new password and retry.
  const listRequest = {
    page: 1,
    limit: 50,
    status: "all",
    orderBy: "issued_at",
    direction: "desc",
  } satisfies ITodoAppSession.IRequest;

  let pageResult: IPageITodoAppSession.ISummary;
  try {
    pageResult = await api.functional.todoApp.todoUser.users.sessions.index(
      connection,
      {
        userId,
        body: listRequest,
      },
    );
  } catch {
    // Re-authenticate this connection with the new password if token rotation invalidated it
    const relogin = await api.functional.auth.todoUser.login(connection, {
      body: {
        email,
        password: newPassword,
      } satisfies ITodoAppTodoUserLogin.IRequest,
    });
    typia.assert(relogin);
    pageResult = await api.functional.todoApp.todoUser.users.sessions.index(
      connection,
      {
        userId,
        body: listRequest,
      },
    );
  }
  typia.assert(pageResult);

  // Ensure that at least one session has been revoked after password change
  const revokedSessions = pageResult.data.filter(
    (s) => s.revoked_at !== null && s.revoked_at !== undefined,
  );
  TestValidator.predicate(
    "at least one session is revoked after password change",
    revokedSessions.length >= 1,
  );

  // 5) Validate that the other session (session B) can no longer call protected APIs
  await TestValidator.error(
    "revoked secondary session cannot list sessions",
    async () => {
      await api.functional.todoApp.todoUser.users.sessions.index(otherConn, {
        userId,
        body: listRequest,
      });
    },
  );

  // 6) Optionally fetch revocation details for one revoked session
  if (revokedSessions.length > 0) {
    const rev = await api.functional.todoApp.todoUser.sessions.revocation.at(
      connection,
      { sessionId: revokedSessions[0].id },
    );
    typia.assert(rev);
    TestValidator.equals(
      "revocation record references the revoked session",
      rev.todo_app_session_id,
      revokedSessions[0].id,
    );
  }

  // 7) Old password should no longer allow login (on a fresh client context)
  const freshConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "cannot login with old password after change",
    async () => {
      await api.functional.auth.todoUser.login(freshConn, {
        body: {
          email,
          password: initialPassword,
        } satisfies ITodoAppTodoUserLogin.IRequest,
      });
    },
  );
}
