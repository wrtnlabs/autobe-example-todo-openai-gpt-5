import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEmailVerification";
import type { ITodoAppGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppGuestVisitor";

/**
 * Validate guest email verification resend issuance and idempotent failure on
 * invalid token.
 *
 * Because the plaintext verification token is not exposed by any API, a
 * successful verification using the real token cannot be performed in E2E.
 * Instead, this test performs a realistic flow that is fully implementable with
 * the provided endpoints while validating important behaviors:
 *
 * 1. Join a guestVisitor with an email (creates user/session context).
 * 2. Resend verification for that email and validate the issued summary:
 *
 *    - Target_email matches requested email
 *    - Consumed_at is null/undefined right after issuance
 * 3. Attempt to confirm verification with an invalid token and assert failure.
 * 4. Repeat the invalid confirmation with the same token to ensure idempotent
 *    failure (no side effects visible to the client; still fails).
 * 5. Resend verification again and confirm fresh, unconsumed issuance for the same
 *    email; optionally verify the id has changed.
 */
export async function test_api_guest_visitor_email_verification_idempotent_consumption(
  connection: api.IConnection,
) {
  // 1) Join a guestVisitor with email
  const email = typia.random<string & tags.Format<"email">>();
  const joined: ITodoAppGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.join(connection, {
      body: {
        email,
      } satisfies ITodoAppGuestVisitor.IJoin,
    });
  typia.assert(joined);

  // 2) Resend verification for that email
  const first: ITodoAppEmailVerification.ISummary =
    await api.functional.auth.guestVisitor.email.verify.resend.resendVerification(
      connection,
      {
        body: {
          email,
        } satisfies ITodoAppEmailVerification.IResendRequest,
      },
    );
  typia.assert(first);

  // Validate target email and unconsumed state
  TestValidator.equals(
    "resend returns summary with matching target_email",
    first.target_email,
    email,
  );
  TestValidator.predicate(
    "newly issued verification must be unconsumed",
    first.consumed_at === null || first.consumed_at === undefined,
  );
  TestValidator.predicate(
    "failure_count is non-negative on freshly issued verification",
    first.failure_count >= 0,
  );

  // 3) Attempt verification with an invalid token (must fail)
  const invalidToken: string = RandomGenerator.alphaNumeric(64);
  await TestValidator.error(
    "verifying with an invalid token should fail",
    async () => {
      await api.functional.auth.guestVisitor.email.verify.verifyEmail(
        connection,
        {
          body: {
            token: invalidToken,
          } satisfies ITodoAppEmailVerification.IConfirm,
        },
      );
    },
  );

  // 4) Repeat with the same invalid token to confirm idempotent failure
  await TestValidator.error(
    "repeating the same invalid token should still fail (idempotent failure)",
    async () => {
      await api.functional.auth.guestVisitor.email.verify.verifyEmail(
        connection,
        {
          body: {
            token: invalidToken,
          } satisfies ITodoAppEmailVerification.IConfirm,
        },
      );
    },
  );

  // 5) Resend again: should return a fresh, unconsumed verification for the same email
  const second: ITodoAppEmailVerification.ISummary =
    await api.functional.auth.guestVisitor.email.verify.resend.resendVerification(
      connection,
      {
        body: {
          email,
        } satisfies ITodoAppEmailVerification.IResendRequest,
      },
    );
  typia.assert(second);

  TestValidator.equals(
    "second resend still targets the same email",
    second.target_email,
    email,
  );
  TestValidator.predicate(
    "second resend is also unconsumed on issuance",
    second.consumed_at === null || second.consumed_at === undefined,
  );

  // Optional but meaningful: subsequent resend should insert a new row per docs
  TestValidator.notEquals(
    "resend inserts a new verification record (different id)",
    second.id,
    first.id,
  );
}
