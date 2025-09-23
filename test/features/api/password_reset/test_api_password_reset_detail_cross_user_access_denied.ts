import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppPasswordReset } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppPasswordReset";
import type { ITodoAppPasswordReset } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPasswordReset";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppTodoUserPasswordReset } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserPasswordReset";

/**
 * Verify cross-user denial when reading another user's password reset record.
 *
 * Business context:
 *
 * - A password reset record is privacy-sensitive. Only the owner must be able to
 *   view its details. Even when another user knows the reset identifier, the
 *   API must deny access without revealing existence details.
 *
 * Steps:
 *
 * 1. Create two isolated auth contexts (User A, User B) using separate connection
 *    objects to keep tokens isolated.
 * 2. In B context, request a password reset for B's email.
 * 3. In B context, list B's password resets and extract an ID for use.
 * 4. In B context, confirm the owner can read the detail by id.
 * 5. In A context, attempt to read B's password reset detail and expect an error
 *    (authorization/privacy denial). Do not check specific status codes.
 */
export async function test_api_password_reset_detail_cross_user_access_denied(
  connection: api.IConnection,
) {
  // Prepare two independent connections (SDK manages tokens per connection)
  const connA: api.IConnection = { ...connection, headers: {} };
  const connB: api.IConnection = { ...connection, headers: {} };

  // 1) Register User A and User B
  const emailA: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const emailB: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const passwordA: string = RandomGenerator.alphaNumeric(12);
  const passwordB: string = RandomGenerator.alphaNumeric(12);

  const authA = await api.functional.auth.todoUser.join(connA, {
    body: {
      email: emailA,
      password: passwordA,
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authA);

  const authB = await api.functional.auth.todoUser.join(connB, {
    body: {
      email: emailB,
      password: passwordB,
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authB);

  // 2) In B context, request a password reset for B's email
  const requested =
    await api.functional.auth.todoUser.password.reset.request.requestPasswordReset(
      connB,
      {
        body: {
          email: emailB,
        } satisfies ITodoAppTodoUserPasswordReset.IRequest,
      },
    );
  typia.assert(requested);

  // 3) In B context, list B's password resets and extract an ID
  const page = await api.functional.todoApp.todoUser.users.passwordResets.index(
    connB,
    {
      userId: authB.id,
      body: {
        email: emailB,
      } satisfies ITodoAppPasswordReset.IRequest,
    },
  );
  typia.assert(page);

  TestValidator.predicate(
    "B's listing contains at least one matching password reset summary",
    page.data.length > 0,
  );

  const pick = page.data.find((s) => s.email === emailB) ?? page.data[0];
  const passwordResetIdB = pick.id;

  // 4) Owner (B) can read own detail
  const ownDetail =
    await api.functional.todoApp.todoUser.users.passwordResets.at(connB, {
      userId: authB.id,
      passwordResetId: passwordResetIdB,
    });
  typia.assert(ownDetail);
  TestValidator.equals(
    "owner's detail email matches B's email",
    ownDetail.email,
    emailB,
  );

  // 5) Cross-user access: A must not read B's record
  await TestValidator.error(
    "cross-user access to B's password reset detail must be denied",
    async () => {
      await api.functional.todoApp.todoUser.users.passwordResets.at(connA, {
        userId: authB.id,
        passwordResetId: passwordResetIdB,
      });
    },
  );
}
