import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ITodoAppSystemAdminPasswordResetConfirm } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminPasswordResetConfirm";
import type { ITodoAppSystemAdminPasswordResetConfirmResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminPasswordResetConfirmResult";

/**
 * Reject invalid system admin password reset token.
 *
 * Scenario:
 *
 * - Attempt to confirm a password reset using an intentionally fabricated, opaque
 *   token.
 * - The server must reject the request without disclosing whether an account
 *   exists, and without applying any side effects.
 *
 * Steps:
 *
 * 1. Generate a random opaque token string and a strong new password (8–64 chars).
 * 2. Call POST /auth/systemAdmin/password/reset/confirm via SDK with the
 *    fabricated token.
 * 3. Expect rejection (an error) on real backend. Use TestValidator.error without
 *    asserting specific HTTP status codes or error messages.
 * 4. If connection.simulate is true, the SDK mock will return a random success
 *    response after schema validation; in that case, perform a smoke call and
 *    typia.assert on output, noting that rejection cannot be asserted under
 *    simulation.
 */
export async function test_api_system_admin_password_reset_confirm_invalid_token_rejected(
  connection: api.IConnection,
) {
  // Prepare fabricated token and a strong password (8-64 characters)
  const fabricatedToken: string = RandomGenerator.alphaNumeric(64);
  const strongPassword: string = RandomGenerator.alphaNumeric(16);

  if (connection.simulate === true) {
    // In simulate mode, backend logic is not executed; SDK returns random data after schema validation.
    const output: ITodoAppSystemAdminPasswordResetConfirmResult =
      await api.functional.auth.systemAdmin.password.reset.confirm.confirmPasswordReset(
        connection,
        {
          body: {
            token: fabricatedToken,
            new_password: strongPassword,
          } satisfies ITodoAppSystemAdminPasswordResetConfirm.ICreate,
        },
      );
    typia.assert(output);
  } else {
    // On real backend, invalid token must be rejected.
    await TestValidator.error(
      "invalid or fabricated reset token must be rejected",
      async () => {
        await api.functional.auth.systemAdmin.password.reset.confirm.confirmPasswordReset(
          connection,
          {
            body: {
              token: fabricatedToken,
              new_password: strongPassword,
            } satisfies ITodoAppSystemAdminPasswordResetConfirm.ICreate,
          },
        );
      },
    );
  }
}
