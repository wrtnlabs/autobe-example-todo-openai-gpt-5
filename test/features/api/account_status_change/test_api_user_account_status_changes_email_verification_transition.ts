import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppAccountStatusChange } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppAccountStatusChange";
import type { ITodoAppAccountStatusChange } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAccountStatusChange";
import type { ITodoAppEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEmailVerification";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppTodoUserEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserEmailVerification";

/**
 * System-admin can review a user's transition from pending_verification to
 * active after email verification.
 *
 * Steps:
 *
 * 1. Register a todoUser (pending_verification by policy).
 * 2. Consume email verification token to activate the account while capturing a
 *    time window.
 * 3. Ensure todoUser cannot access admin audit endpoint (negative test).
 * 4. Register a systemAdmin to acquire admin privileges.
 * 5. Query account status changes filtered by userId, statuses, and time window;
 *    verify presence and fields.
 */
export async function test_api_user_account_status_changes_email_verification_transition(
  connection: api.IConnection,
) {
  // 1) Register a todoUser
  const userEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const todoUser: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email: userEmail,
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(todoUser);

  // Prepare time window around verification
  const createdAtFrom: string & tags.Format<"date-time"> =
    new Date().toISOString();

  // 2) Consume email verification token
  const verification: ITodoAppEmailVerification =
    await api.functional.auth.todoUser.email.verify.verifyEmail(connection, {
      body: {
        token: RandomGenerator.alphaNumeric(32),
      } satisfies ITodoAppTodoUserEmailVerification.IConsume,
    });
  typia.assert(verification);

  // Close the window slightly after verification to ensure inclusion
  const createdAtTo: string & tags.Format<"date-time"> = new Date(
    Date.now() + 5 * 60 * 1000,
  ).toISOString();

  // 3) Negative access control: todoUser must NOT access admin-only endpoint
  await TestValidator.error(
    "todoUser cannot list account status changes (admin-only)",
    async () => {
      await api.functional.todoApp.systemAdmin.users.accountStatusChanges.index(
        connection,
        {
          userId: todoUser.id,
          body: {
            target_user_id: todoUser.id,
            previous_status: "pending_verification",
            new_status: "active",
            orderBy: "created_at",
            orderDirection: "desc",
            created_at_from: createdAtFrom,
            created_at_to: createdAtTo,
            page: 1,
            limit: 20,
          } satisfies ITodoAppAccountStatusChange.IRequest,
        },
      );
    },
  );

  // 4) Register a systemAdmin (token switches automatically)
  const adminEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: adminEmail,
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(admin);

  // 5) Query status changes as systemAdmin
  const page: IPageITodoAppAccountStatusChange =
    await api.functional.todoApp.systemAdmin.users.accountStatusChanges.index(
      connection,
      {
        userId: todoUser.id,
        body: {
          target_user_id: todoUser.id,
          previous_status: "pending_verification",
          new_status: "active",
          orderBy: "created_at",
          orderDirection: "desc",
          created_at_from: createdAtFrom,
          created_at_to: createdAtTo,
          page: 1,
          limit: 20,
        } satisfies ITodoAppAccountStatusChange.IRequest,
      },
    );
  typia.assert(page);

  // Find the expected transition row
  const found = page.data.find(
    (r) =>
      r.target_user_id === todoUser.id &&
      r.previous_status === "pending_verification" &&
      r.new_status === "active",
  );

  // Assert presence (sync predicate is sufficient)
  TestValidator.predicate(
    "status change entry exists for the verified user",
    found !== undefined,
  );

  if (found !== undefined) {
    // Validate target id matches
    TestValidator.equals(
      "target_user_id matches the created todoUser id",
      found.target_user_id,
      todoUser.id,
    );
    // Admin user id should be null/undefined for system-driven verification
    TestValidator.equals(
      "admin_user_id should be null for system-driven transition",
      found.admin_user_id ?? null,
      null,
    );
    // created_at within window
    TestValidator.predicate(
      "created_at within captured verification window",
      createdAtFrom <= found.created_at && found.created_at <= createdAtTo,
    );
  }
}
