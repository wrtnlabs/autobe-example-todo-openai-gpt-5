import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppEmailVerification";
import type { ITodoAppEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEmailVerification";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Email verification listing returns empty for out-of-range date window and
 * enforces owner scope.
 *
 * Steps:
 *
 * 1. Register and authenticate User A via /auth/todoUser/join to obtain userId and
 *    auth context.
 * 2. Query /todoApp/todoUser/users/{userId}/emailVerifications with a far-past
 *    sent_at window (outside of any current records), expect an empty page.
 * 3. Register and authenticate User B, then attempt to list User A’s
 *    verifications; expect an error due to scope enforcement.
 */
export async function test_api_email_verifications_list_date_window_empty_result(
  connection: api.IConnection,
) {
  // 1) Register and authenticate User A
  const joinBodyA = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const userA: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBodyA });
  typia.assert(userA);

  // 2) Query with a far-past time window to ensure empty result
  const pastFromIso = new Date(2000, 0, 1).toISOString(); // 2000-01-01T00:00:00.000Z
  const pastToIso = new Date(2000, 0, 2).toISOString(); // 2000-01-02T00:00:00.000Z

  const emptyWindowRequest = {
    sent_at_from: pastFromIso,
    sent_at_to: pastToIso,
    order_by: "sent_at",
    order_dir: "desc",
  } satisfies ITodoAppEmailVerification.IRequest;

  const pageResult: IPageITodoAppEmailVerification.ISummary =
    await api.functional.todoApp.todoUser.users.emailVerifications.index(
      connection,
      {
        userId: userA.id,
        body: emptyWindowRequest,
      },
    );
  typia.assert(pageResult);

  TestValidator.equals(
    "empty result for far-past date window",
    pageResult.data.length,
    0,
  );
  TestValidator.equals(
    "records count should be 0 when no matches",
    pageResult.pagination.records,
    0,
  );

  // 3) Authorization boundary: User B should not read User A's verifications
  const joinBodyB = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const userB: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBodyB });
  typia.assert(userB);

  await TestValidator.error(
    "other user cannot access owner-only verifications",
    async () => {
      await api.functional.todoApp.todoUser.users.emailVerifications.index(
        connection,
        {
          userId: userA.id, // attempting to read User A while logged in as User B
          body: {} satisfies ITodoAppEmailVerification.IRequest,
        },
      );
    },
  );
}
