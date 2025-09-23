import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ITodoAppSystemAdminEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminEmailVerification";
import type { ITodoAppSystemAdminEmailVerificationResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminEmailVerificationResult";

export async function test_api_system_admin_email_verification_invalid_token_failure(
  connection: api.IConnection,
) {
  /**
   * Validate that invalid or malformed tokens are rejected by the public System
   * Admin email verification endpoint without leaking account existence or
   * causing side effects.
   *
   * Cases covered:
   *
   * 1. Random opaque token (non-existent)
   * 2. Empty string token
   * 3. Overly long token
   * 4. Whitespace-only token
   * 5. Replay the same invalid token
   */

  // 1) Random opaque token (very unlikely to exist in DB)
  const randomGarbageToken: string = `invalid.${RandomGenerator.alphaNumeric(64)}`;
  await TestValidator.error("rejects non-existent opaque token", async () => {
    await api.functional.auth.systemAdmin.email.verify.verifyEmail(connection, {
      body: {
        token: randomGarbageToken,
      } satisfies ITodoAppSystemAdminEmailVerification.ICreate,
    });
  });

  // 2) Empty string token
  const emptyToken = "";
  await TestValidator.error("rejects empty token string", async () => {
    await api.functional.auth.systemAdmin.email.verify.verifyEmail(connection, {
      body: {
        token: emptyToken,
      } satisfies ITodoAppSystemAdminEmailVerification.ICreate,
    });
  });

  // 3) Overly long token (malformed length)
  const overlyLongToken = RandomGenerator.alphabets(2048);
  await TestValidator.error("rejects overly long token string", async () => {
    await api.functional.auth.systemAdmin.email.verify.verifyEmail(connection, {
      body: {
        token: overlyLongToken,
      } satisfies ITodoAppSystemAdminEmailVerification.ICreate,
    });
  });

  // 4) Whitespace-only token
  const whitespaceToken = "   ";
  await TestValidator.error("rejects whitespace-only token", async () => {
    await api.functional.auth.systemAdmin.email.verify.verifyEmail(connection, {
      body: {
        token: whitespaceToken,
      } satisfies ITodoAppSystemAdminEmailVerification.ICreate,
    });
  });

  // 5) Replay: using the same invalid token again should consistently fail
  await TestValidator.error(
    "rejects repeated submission of the same invalid token",
    async () => {
      await api.functional.auth.systemAdmin.email.verify.verifyEmail(
        connection,
        {
          body: {
            token: randomGarbageToken,
          } satisfies ITodoAppSystemAdminEmailVerification.ICreate,
        },
      );
    },
  );
}
