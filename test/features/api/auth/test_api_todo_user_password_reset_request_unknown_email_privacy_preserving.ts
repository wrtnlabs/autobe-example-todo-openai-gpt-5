import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ITodoAppPasswordReset } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPasswordReset";
import type { ITodoAppTodoUserPasswordReset } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserPasswordReset";

/**
 * Privacy-preserving password reset request with unknown email.
 *
 * Validates that submitting password reset for non-existing emails returns the
 * same generic acknowledgment without disclosing account existence.
 *
 * Steps:
 *
 * 1. Generate two highly-unique emails unlikely to exist.
 * 2. Call POST /auth/todoUser/password/reset/request for each email.
 * 3. Assert response types and business rules:
 *
 *    - Echoed email matches input.
 *    - Requested_at/expires_at are valid and chronological.
 * 4. Verify privacy preservation across different emails by asserting consistent
 *    optional note presence (no existence-based branching).
 */
export async function test_api_todo_user_password_reset_request_unknown_email_privacy_preserving(
  connection: api.IConnection,
) {
  // 1) Generate two unique, unknown-looking emails via UUID-based local parts
  const local1 = typia.random<string & tags.Format<"uuid">>();
  const local2 = typia.random<string & tags.Format<"uuid">>();
  const unknownEmail1 = `${local1}@no-such-user.example.com`;
  const unknownEmail2 = `${local2}@no-such-user.example.com`;

  // Prepare request bodies with strict typing
  const reqBody1 = {
    email: typia.assert<string & tags.Format<"email">>(unknownEmail1),
  } satisfies ITodoAppTodoUserPasswordReset.IRequest;
  const reqBody2 = {
    email: typia.assert<string & tags.Format<"email">>(unknownEmail2),
  } satisfies ITodoAppTodoUserPasswordReset.IRequest;

  // 2) Call the endpoint for each email
  const ack1: ITodoAppPasswordReset.IRequested =
    await api.functional.auth.todoUser.password.reset.request.requestPasswordReset(
      connection,
      { body: reqBody1 },
    );
  typia.assert(ack1);

  const ack2: ITodoAppPasswordReset.IRequested =
    await api.functional.auth.todoUser.password.reset.request.requestPasswordReset(
      connection,
      { body: reqBody2 },
    );
  typia.assert(ack2);

  // 3) Business validations
  // Distinct emails to avoid accidental coupling
  TestValidator.notEquals(
    "two generated emails are distinct to avoid collision",
    ack1.email,
    ack2.email,
  );

  // Echoed email must match submitted
  TestValidator.equals(
    "echoed email equals submitted for first request",
    ack1.email,
    reqBody1.email,
  );
  TestValidator.equals(
    "echoed email equals submitted for second request",
    ack2.email,
    reqBody2.email,
  );

  // Timestamp parsing and ordering
  const now = Date.now();
  const reqAt1 = new Date(ack1.requested_at).getTime();
  const expAt1 = new Date(ack1.expires_at).getTime();
  const reqAt2 = new Date(ack2.requested_at).getTime();
  const expAt2 = new Date(ack2.expires_at).getTime();

  TestValidator.predicate(
    "requested_at (1) parses to valid time",
    Number.isFinite(reqAt1) && reqAt1 > 0,
  );
  TestValidator.predicate(
    "expires_at (1) parses to valid time",
    Number.isFinite(expAt1) && expAt1 > 0,
  );
  TestValidator.predicate(
    "requested_at (2) parses to valid time",
    Number.isFinite(reqAt2) && reqAt2 > 0,
  );
  TestValidator.predicate(
    "expires_at (2) parses to valid time",
    Number.isFinite(expAt2) && expAt2 > 0,
  );

  TestValidator.predicate(
    "expires_at is not earlier than requested_at (1)",
    expAt1 >= reqAt1,
  );
  TestValidator.predicate(
    "expires_at is not earlier than requested_at (2)",
    expAt2 >= reqAt2,
  );
  TestValidator.predicate(
    "expires_at should be in the future (1)",
    expAt1 >= now,
  );
  TestValidator.predicate(
    "expires_at should be in the future (2)",
    expAt2 >= now,
  );

  // 4) Privacy-preserving behavior: optional note presence should not vary by email existence
  // Compare presence only (not contents) to avoid brittle assertions.
  const hasNote1 = ack1.note !== undefined;
  const hasNote2 = ack2.note !== undefined;
  TestValidator.equals(
    "privacy-preserving: optional note presence is consistent across emails",
    hasNote1,
    hasNote2,
  );
}
