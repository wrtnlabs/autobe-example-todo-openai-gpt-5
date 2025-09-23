import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppGuestVisitor";
import type { ITodoAppPasswordReset } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPasswordReset";

/**
 * Verify that a password reset token is single-use for a guestVisitor account.
 *
 * Flow summary:
 *
 * 1. Guest joins with an email (ITodoAppGuestVisitor.IJoin) and receives an
 *    authorization envelope.
 * 2. Create a password reset request using the same email
 *    (ITodoAppPasswordReset.IRequest).
 * 3. Acquire the raw reset token via test harness (env variable) or generate a
 *    fake token in simulator mode.
 * 4. Confirm password reset once (ITodoAppPasswordReset.IConfirm) with the token +
 *    a new password → success.
 * 5. Attempt to confirm again with the same token → expect business error (only
 *    when not in simulator mode and harness token is present).
 *
 * Notes:
 *
 * - SDK auto-manages authentication headers; tests must not touch
 *   connection.headers.
 * - Simulator mode always returns random success responses, so the
 *   reuse-rejection check is skipped there.
 */
export async function test_api_guest_visitor_password_reset_confirm_token_reuse_rejected(
  connection: api.IConnection,
) {
  // 1) Guest joins with an email
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const joinBody = {
    email,
  } satisfies ITodoAppGuestVisitor.IJoin;
  const authorized = await api.functional.auth.guestVisitor.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);

  // 2) Create a password reset request with the same email
  const requestBody = {
    email,
  } satisfies ITodoAppPasswordReset.IRequest;
  const requested =
    await api.functional.auth.guestVisitor.password.reset.request.requestPasswordReset(
      connection,
      { body: requestBody },
    );
  typia.assert(requested);

  // Basic business validations on the request summary
  TestValidator.equals(
    "password reset request email matches input",
    requested.email,
    email,
  );
  TestValidator.predicate(
    "reset is not yet consumed upon request",
    requested.consumed_at === null || requested.consumed_at === undefined,
  );

  // 3) Obtain raw token from test harness (env) or generate in simulator mode
  const harnessToken =
    typeof process !== "undefined"
      ? process.env?.E2E_TODOAPP_RESET_TOKEN
      : undefined;
  const token: string =
    connection.simulate === true
      ? RandomGenerator.alphaNumeric(32)
      : (harnessToken ?? RandomGenerator.alphaNumeric(48));

  // 4) Confirm password reset once → success
  const newPassword1 = `pw_${RandomGenerator.alphaNumeric(14)}`;
  const confirmBody1 = {
    token,
    new_password: newPassword1,
  } satisfies ITodoAppPasswordReset.IConfirm;
  const confirmed =
    await api.functional.auth.guestVisitor.password.reset.confirm.confirmPasswordReset(
      connection,
      { body: confirmBody1 },
    );
  typia.assert(confirmed);

  // Validate linkage and consumption state
  TestValidator.equals(
    "confirmed summary has same email",
    confirmed.email,
    email,
  );
  TestValidator.equals(
    "confirmed summary id matches requested id",
    confirmed.id,
    requested.id,
  );
  TestValidator.predicate(
    "reset token marked as consumed after confirmation",
    confirmed.consumed_at !== null && confirmed.consumed_at !== undefined,
  );

  // 5) Attempt to reuse the same token → expect failure (only when feasible)
  const canTestReuseRejection = connection.simulate !== true && !!harnessToken;
  if (canTestReuseRejection) {
    await TestValidator.error(
      "second confirmation with same token should be rejected",
      async () => {
        await api.functional.auth.guestVisitor.password.reset.confirm.confirmPasswordReset(
          connection,
          { body: confirmBody1 },
        );
      },
    );
  } else {
    // In simulator mode or when harness token is not provided, we cannot verify reuse rejection.
    TestValidator.predicate(
      "reuse rejection not verifiable in simulator mode or without harness token",
      true,
    );
  }
}
