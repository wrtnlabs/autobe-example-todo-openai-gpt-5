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
 * Deny cross-user listing of password reset requests and unauthenticated
 * access.
 *
 * Purpose
 *
 * - Ensure a signed-in todoUser (User A) cannot list another user's (User B)
 *   password reset records.
 * - Ensure unauthenticated clients cannot list password reset records.
 *
 * Flow
 *
 * 1. Create User B and keep B.id and B.email
 * 2. Publicly request a password reset for B's email (creates a record)
 * 3. Create User A (connection becomes authenticated as A)
 * 4. While authenticated as A, attempt to list B's password resets → expect error
 * 5. From an unauthenticated connection, attempt to list A's (or B's) password
 *    resets → expect error
 *
 * Notes
 *
 * - Use only valid DTOs with proper typing; do not test type validation errors
 * - Do not check HTTP status codes; only assert that an error occurs
 * - Do not manipulate headers except creating a shallow unauthenticated
 *   connection with headers: {}
 */
export async function test_api_password_resets_list_cross_user_denied(
  connection: api.IConnection,
) {
  // 1) Create User B
  const emailB: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const passwordB: string & tags.MinLength<8> & tags.MaxLength<64> =
    typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>();
  const createBBody = {
    email: emailB,
    password: passwordB,
  } satisfies ITodoAppTodoUser.ICreate;
  const userB: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: createBBody });
  typia.assert(userB);

  // 2) Request a password reset for B (public endpoint)
  const resetReqBodyB = {
    email: emailB,
  } satisfies ITodoAppTodoUserPasswordReset.IRequest;
  const resetAckB: ITodoAppPasswordReset.IRequested =
    await api.functional.auth.todoUser.password.reset.request.requestPasswordReset(
      connection,
      { body: resetReqBodyB },
    );
  typia.assert(resetAckB);

  // 3) Create User A (switches auth to A)
  const emailA: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const passwordA: string & tags.MinLength<8> & tags.MaxLength<64> =
    typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>();
  const createABody = {
    email: emailA,
    password: passwordA,
  } satisfies ITodoAppTodoUser.ICreate;
  const userA: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: createABody });
  typia.assert(userA);

  // 4) Authenticated as A, attempt to list B's password resets → expect denial
  const listBodyEmpty = {
    // all fields optional; send empty request body
  } satisfies ITodoAppPasswordReset.IRequest;
  await TestValidator.error(
    "cross-user listing must be denied (A cannot list B's password resets)",
    async () => {
      await api.functional.todoApp.todoUser.users.passwordResets.index(
        connection,
        {
          userId: userB.id,
          body: listBodyEmpty,
        },
      );
    },
  );

  // 5) Unauthenticated connection attempting to list A's password resets → expect denial
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated client must be denied when listing password resets",
    async () => {
      await api.functional.todoApp.todoUser.users.passwordResets.index(
        unauthConn,
        {
          userId: userA.id,
          body: listBodyEmpty,
        },
      );
    },
  );
}
