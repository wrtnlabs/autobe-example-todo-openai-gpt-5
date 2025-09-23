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
 * Verify that an authenticated todoUser can retrieve the detail of their own
 * password reset record created via the public reset request flow.
 *
 * Steps:
 *
 * 1. Register a new todoUser (join) to obtain authenticated context
 * 2. Publicly request a password reset for the same email
 * 3. List the user’s password reset records (owner-protected) and pick latest
 * 4. Retrieve the specific password reset detail and validate business rules
 */
export async function test_api_password_reset_detail_owner_access(
  connection: api.IConnection,
) {
  // 1) Register a new todoUser
  const email = typia.random<string & tags.Format<"email">>();
  const password = RandomGenerator.alphaNumeric(12);

  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: {
      email,
      password,
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authorized);

  // 2) Initiate a password reset request for the same email (public endpoint)
  const requestedAck =
    await api.functional.auth.todoUser.password.reset.request.requestPasswordReset(
      connection,
      {
        body: {
          email,
        } satisfies ITodoAppTodoUserPasswordReset.IRequest,
      },
    );
  typia.assert(requestedAck);

  // 3) Using authenticated context, list user password resets ordered by latest
  const page = await api.functional.todoApp.todoUser.users.passwordResets.index(
    connection,
    {
      userId: authorized.id,
      body: {
        email,
        order_by: "requested_at",
        order_dir: "desc",
      } satisfies ITodoAppPasswordReset.IRequest,
    },
  );
  typia.assert(page);

  // Ensure at least one record exists (the one we just requested)
  TestValidator.predicate(
    "password reset list must have at least one item",
    page.data.length > 0,
  );
  const summary = page.data[0];

  // 4) Retrieve the detail record by id
  const detail = await api.functional.todoApp.todoUser.users.passwordResets.at(
    connection,
    {
      userId: authorized.id,
      passwordResetId: summary.id,
    },
  );
  typia.assert(detail);

  // Identity and ownership validations
  TestValidator.equals(
    "detail id matches the listed summary id",
    detail.id,
    summary.id,
  );
  TestValidator.equals(
    "detail email echoes the requested email",
    detail.email,
    email,
  );

  // todo_app_user_id may be null (privacy). If present, it must match the owner id.
  TestValidator.predicate(
    "todo_app_user_id is either nullish or equals the authenticated user id",
    detail.todo_app_user_id === null ||
      detail.todo_app_user_id === undefined ||
      detail.todo_app_user_id === authorized.id,
  );

  // Lifecycle fields: consumed_at should be nullish right after request
  TestValidator.predicate(
    "consumed_at is nullish immediately after request",
    detail.consumed_at === null || detail.consumed_at === undefined,
  );

  // Temporal logic: requested_at <= now < expires_at
  const now = new Date();
  const requestedAt = new Date(detail.requested_at);
  const expiresAt = new Date(detail.expires_at);

  TestValidator.predicate(
    "requested_at is not in the future",
    requestedAt.getTime() <= now.getTime(),
  );
  TestValidator.predicate(
    "expires_at is in the future",
    now.getTime() < expiresAt.getTime(),
  );
}
