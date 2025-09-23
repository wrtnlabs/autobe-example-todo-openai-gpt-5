import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ITodoAppEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEmailVerification";
import type { ITodoAppTodoUserEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserEmailVerification";

export async function test_api_todo_user_email_verification_invalid_token(
  connection: api.IConnection,
) {
  /**
   * Validate that the email verification endpoint rejects invalid/expired
   * tokens without leaking account existence and continues to reject on
   * retries.
   *
   * Steps:
   *
   * 1. Generate an opaque token string that should not correspond to any stored
   *    token_hash.
   * 2. Call POST /auth/todoUser/email/verify with the invalid token and expect
   *    failure.
   * 3. Retry with the same invalid token and expect failure again (idempotent
   *    failure).
   * 4. Try a different invalid token and expect failure as well.
   *
   * Notes:
   *
   * - Use correct DTO types; do not test HTTP status codes or error messages.
   * - Do not manipulate connection.headers; the SDK handles auth automatically.
   */
  const invalidToken1: string = RandomGenerator.alphaNumeric(64);
  const invalidToken2: string = RandomGenerator.alphaNumeric(64);

  // First attempt with invalid token should fail
  await TestValidator.error(
    "reject invalid email verification token (first attempt)",
    async () => {
      await api.functional.auth.todoUser.email.verify.verifyEmail(connection, {
        body: {
          token: invalidToken1,
        } satisfies ITodoAppTodoUserEmailVerification.IConsume,
      });
    },
  );

  // Second attempt with the same invalid token should also fail
  await TestValidator.error(
    "reject same invalid token on retry (second attempt)",
    async () => {
      await api.functional.auth.todoUser.email.verify.verifyEmail(connection, {
        body: {
          token: invalidToken1,
        } satisfies ITodoAppTodoUserEmailVerification.IConsume,
      });
    },
  );

  // A different random invalid token should fail as well
  await TestValidator.error(
    "reject another invalid token (different opaque value)",
    async () => {
      await api.functional.auth.todoUser.email.verify.verifyEmail(connection, {
        body: {
          token: invalidToken2,
        } satisfies ITodoAppTodoUserEmailVerification.IConsume,
      });
    },
  );
}
