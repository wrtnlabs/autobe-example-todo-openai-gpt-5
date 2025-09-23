import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ITodoAppEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEmailVerification";

/**
 * Verify that email verification rejects invalid tokens without information
 * leakage.
 *
 * Scenario
 *
 * - Attempt to verify email with a syntactically valid but unknown token.
 * - In real server mode, the request must fail (runtime error) without asserting
 *   on specific status codes or messages (privacy-preserving failure).
 * - In SDK simulate mode (connection.simulate === true), the SDK returns a mocked
 *   ISummary; just type-validate it.
 *
 * Notes
 *
 * - No pre-seeding or DB assertions are available, so we focus on the
 *   invalid-token failure path only.
 * - We never manipulate headers, nor validate HTTP status codes or error bodies.
 */
export async function test_api_guest_visitor_email_verification_invalid_or_expired_token(
  connection: api.IConnection,
) {
  // Prepare a syntactically plausible opaque token that is not expected to exist
  const unknownToken: string = RandomGenerator.alphaNumeric(64);

  if (connection.simulate === true) {
    // In simulate mode, SDK returns mock success data; just validate the type
    const output =
      await api.functional.auth.guestVisitor.email.verify.verifyEmail(
        connection,
        {
          body: {
            token: unknownToken,
          } satisfies ITodoAppEmailVerification.IConfirm,
        },
      );
    typia.assert(output);
    // No additional assertions; typia.assert() already guarantees perfect typing
    return;
  }

  // In real server mode, invalid/unknown token must fail without information leakage
  await TestValidator.error(
    "invalid email verification token should fail without info leakage",
    async () => {
      await api.functional.auth.guestVisitor.email.verify.verifyEmail(
        connection,
        {
          body: {
            token: unknownToken,
          } satisfies ITodoAppEmailVerification.IConfirm,
        },
      );
    },
  );
}
