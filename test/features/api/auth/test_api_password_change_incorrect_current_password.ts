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
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppTodoUserPassword } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserPassword";

export async function test_api_password_change_incorrect_current_password(
  connection: api.IConnection,
) {
  // 1) Register and authenticate a todoUser (session A)
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const originalPassword: string = RandomGenerator.alphaNumeric(12);

  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email,
        password: originalPassword,
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(authorized);

  // 2) Baseline session snapshot
  const beforePage = await api.functional.todoApp.todoUser.users.sessions.index(
    connection,
    {
      userId: authorized.id,
      body: {
        page: 1,
        limit: 50,
        status: "all",
        orderBy: "issued_at",
        direction: "desc",
      } satisfies ITodoAppSession.IRequest,
    },
  );
  typia.assert(beforePage);

  const beforeMap = new Map(beforePage.data.map((s) => [s.id, s] as const));

  // 3) Attempt password change with incorrect current password → should fail
  const wrongCurrent: string = `${originalPassword}x`;
  const newPassword: string = RandomGenerator.alphaNumeric(12);

  await TestValidator.error(
    "password change should fail when current password is incorrect",
    async () => {
      await api.functional.auth.todoUser.password.change.changePassword(
        connection,
        {
          body: {
            currentPassword: wrongCurrent,
            newPassword: newPassword,
            revokeOtherSessions: true,
          } satisfies ITodoAppTodoUserPassword.IChange,
        },
      );
    },
  );

  // 4) Post-condition: sessions remain unaffected
  const afterPage = await api.functional.todoApp.todoUser.users.sessions.index(
    connection,
    {
      userId: authorized.id,
      body: {
        page: 1,
        limit: 50,
        status: "all",
        orderBy: "issued_at",
        direction: "desc",
      } satisfies ITodoAppSession.IRequest,
    },
  );
  typia.assert(afterPage);

  // Validate session total count unchanged
  TestValidator.equals(
    "session total count unchanged after failed password change",
    afterPage.pagination.records,
    beforePage.pagination.records,
  );

  // Validate no revocation changes for overlapping sessions
  for (const after of afterPage.data) {
    const prev = beforeMap.get(after.id);
    if (!prev) continue; // Only compare overlapping sessions
    TestValidator.equals(
      "revoked_at unchanged for existing sessions",
      after.revoked_at ?? null,
      prev.revoked_at ?? null,
    );
  }
}
