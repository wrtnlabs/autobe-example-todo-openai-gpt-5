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
 * Verify password reset request acknowledgment and persistence for an existing
 * user.
 *
 * Steps:
 *
 * 1. Register a new todoUser (join) to obtain authenticated context.
 * 2. Request password reset by email; validate privacy-preserving acknowledgment.
 * 3. List password reset records for the authenticated user; verify a new record
 *    exists with coherent fields.
 */
export async function test_api_todo_user_password_reset_request_existing_user_acknowledged(
  connection: api.IConnection,
) {
  // 1) Register a new todoUser
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12); // 8-64 length policy satisfied

  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email,
        password,
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(authorized);

  // 2) Request password reset with that email
  const ack: ITodoAppPasswordReset.IRequested =
    await api.functional.auth.todoUser.password.reset.request.requestPasswordReset(
      connection,
      {
        body: {
          email,
        } satisfies ITodoAppTodoUserPasswordReset.IRequest,
      },
    );
  typia.assert(ack);

  // Validate public acknowledgment fields and privacy expectations
  TestValidator.equals(
    "acknowledgment echoes submitted email without confirming existence",
    ack.email,
    email,
  );
  const nowMs: number = Date.now();
  const requestedMs: number = new Date(ack.requested_at).getTime();
  const expiresMs: number = new Date(ack.expires_at).getTime();
  TestValidator.predicate(
    "requested_at is not in the future",
    requestedMs <= nowMs,
  );
  TestValidator.predicate(
    "expires_at is after requested_at",
    expiresMs > requestedMs,
  );
  TestValidator.predicate("expires_at is in the future", expiresMs > nowMs);

  // 3) List password reset records for the authenticated user to confirm persistence
  const page: IPageITodoAppPasswordReset.ISummary =
    await api.functional.todoApp.todoUser.users.passwordResets.index(
      connection,
      {
        userId: authorized.id,
        body: {
          page: 1,
          limit: 20,
          email,
          consumed: false,
          order_by: "requested_at",
          order_dir: "desc",
        } satisfies ITodoAppPasswordReset.IRequest,
      },
    );
  typia.assert(page);

  // Confirm at least one matching reset record exists
  const found = page.data.find(
    (r) =>
      r.email === email && new Date(r.requested_at).getTime() >= requestedMs,
  );
  TestValidator.predicate(
    "a matching reset record is present in the authenticated listing",
    found !== undefined,
  );
  if (!found) return; // Defensive: stop if not found to avoid further null checks

  // Validate listed record fields
  TestValidator.equals(
    "listed record email matches requested email",
    found.email,
    email,
  );
  const listedRequestedMs: number = new Date(found.requested_at).getTime();
  const listedExpiresMs: number = new Date(found.expires_at).getTime();
  TestValidator.predicate(
    "listed requested_at at or after acknowledgment",
    listedRequestedMs >= requestedMs,
  );
  TestValidator.predicate(
    "listed expires_at is after listed requested_at",
    listedExpiresMs > listedRequestedMs,
  );
  TestValidator.predicate(
    "consumed_at is null or undefined prior to token consumption",
    found.consumed_at === null || found.consumed_at === undefined,
  );
}
