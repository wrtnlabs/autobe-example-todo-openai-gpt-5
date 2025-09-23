import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppGuestVisitor";
import type { ITodoAppPasswordReset } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPasswordReset";

/**
 * Complete password reset confirmation using a valid token (happy path).
 *
 * Steps:
 *
 * 1. Join as a guestVisitor with a random email.
 * 2. Request a password reset for the same email.
 * 3. Confirm the password reset with an opaque token and a new password.
 * 4. Validate success summary and that the token was consumed.
 *
 * Notes:
 *
 * - This test uses simulation mode to avoid dependency on out-of-band token
 *   retrieval.
 */
export async function test_api_guest_visitor_password_reset_confirm_success_with_token(
  connection: api.IConnection,
) {
  // Use simulation mode to ensure a valid flow without external token fixture
  const simulated: api.IConnection = { ...connection, simulate: true };

  // 1) Join guestVisitor with a random email
  const email = typia.random<string & tags.Format<"email">>();
  const auth: ITodoAppGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.join(simulated, {
      body: { email } satisfies ITodoAppGuestVisitor.IJoin,
    });
  typia.assert(auth);

  // 2) Request password reset for the email
  const requested: ITodoAppPasswordReset.ISummary =
    await api.functional.auth.guestVisitor.password.reset.request.requestPasswordReset(
      simulated,
      {
        body: { email } satisfies ITodoAppPasswordReset.IRequest,
      },
    );
  typia.assert(requested);

  // 3) Confirm reset with opaque token and new password
  const token: string = RandomGenerator.alphaNumeric(48);
  const newPassword: string = RandomGenerator.alphaNumeric(16);

  const confirmed: ITodoAppPasswordReset.ISummary =
    await api.functional.auth.guestVisitor.password.reset.confirm.confirmPasswordReset(
      simulated,
      {
        body: {
          token,
          new_password: newPassword,
        } satisfies ITodoAppPasswordReset.IConfirm,
      },
    );
  typia.assert(confirmed);

  // 4) Business validations
  TestValidator.equals(
    "confirmation summary email matches requested email",
    confirmed.email,
    email,
  );
  TestValidator.predicate(
    "confirmation marks token as consumed (consumed_at is set)",
    confirmed.consumed_at !== null && confirmed.consumed_at !== undefined,
  );
}
