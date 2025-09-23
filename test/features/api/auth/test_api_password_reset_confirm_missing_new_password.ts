import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ITodoAppPasswordReset } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPasswordReset";
import type { ITodoAppTodoUserPasswordReset } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserPasswordReset";

export async function test_api_password_reset_confirm_missing_new_password(
  connection: api.IConnection,
) {
  /**
   * Validate input validation when required fields (e.g., new password) are
   * missing or empty during reset confirmation.
   *
   * Workflow:
   *
   * 1. Call POST /auth/todoUser/password/reset/confirm with a syntactically
   *    valid-looking token string but invalid new_password values.
   *
   *    - Case A: new_password is empty string (violates MinLength<8>)
   *    - Case B: new_password is too short (e.g., length 7)
   * 2. Expect validation errors and ensure no assumptions about token/account
   *    disclosure.
   *
   * Validation points:
   *
   * - The API call should throw for each invalid new_password case (business
   *   validation failure rather than type error).
   * - Do not check specific HTTP status codes or error payloads; only assert
   *   error occurrence.
   */

  // 1) Prepare a plausible opaque token (syntactically valid-looking)
  const token: string = RandomGenerator.alphaNumeric(64);

  // 2) Case A: new_password = "" (empty string) -> violates password MinLength<8>
  await TestValidator.error(
    "empty new_password should be rejected",
    async () => {
      await api.functional.auth.todoUser.password.reset.confirm.confirmPasswordReset(
        connection,
        {
          body: {
            token,
            new_password: "",
          } satisfies ITodoAppTodoUserPasswordReset.IConfirm,
        },
      );
    },
  );

  // 3) Case B: new_password too short (length < 8)
  await TestValidator.error(
    "too-short new_password should be rejected",
    async () => {
      await api.functional.auth.todoUser.password.reset.confirm.confirmPasswordReset(
        connection,
        {
          body: {
            token,
            new_password: "short7", // below policy minimum 8
          } satisfies ITodoAppTodoUserPasswordReset.IConfirm,
        },
      );
    },
  );
}
