import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ITodoAppPasswordReset } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPasswordReset";
import type { ITodoAppTodoUserPasswordReset } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserPasswordReset";

/**
 * Confirm password reset with an invalid token should fail without side
 * effects.
 *
 * Business intent:
 *
 * - The password reset confirmation endpoint must strictly validate the opaque
 *   token against stored token_hash, expiry, and single-use semantics.
 * - When the token is invalid (non-existent/malformed/expired/consumed), the
 *   endpoint must reject the request without leaking account existence.
 *
 * Test flow:
 *
 * 1. Build a clearly invalid token (random string) and a valid new password that
 *    meets policy (8–64 chars).
 * 2. Call POST /auth/todoUser/password/reset/confirm with those values.
 * 3. Validate that an error occurs (business logic rejection). Do not validate
 *    specific status codes or error message contents, in accordance with
 *    rules.
 */
export async function test_api_password_reset_confirm_invalid_token(
  connection: api.IConnection,
) {
  // 1) Prepare invalid token and valid new password
  const invalidToken: string = RandomGenerator.alphaNumeric(24);
  const newPassword = typia.random<
    string & tags.MinLength<8> & tags.MaxLength<64>
  >();

  // 2) Call the endpoint expecting a failure due to invalid token
  await TestValidator.error(
    "invalid password reset token must be rejected",
    async () => {
      await api.functional.auth.todoUser.password.reset.confirm.confirmPasswordReset(
        connection,
        {
          body: {
            token: invalidToken,
            new_password: newPassword,
          } satisfies ITodoAppTodoUserPasswordReset.IConfirm,
        },
      );
    },
  );
}
