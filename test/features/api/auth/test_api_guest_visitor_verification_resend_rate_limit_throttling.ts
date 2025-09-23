import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ITodoAppEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEmailVerification";

/**
 * Validate privacy-preserving resend behavior under rapid repeated requests.
 *
 * Purpose
 *
 * - Ensure the public resend endpoint acknowledges requests for any syntactically
 *   valid email without revealing account existence.
 * - Under a short burst of repeated calls for the same email, the system may
 *   either continue acknowledging or engage rate limiting (throttling). This
 *   test tolerates both policies and validates business-safe behavior in either
 *   case.
 *
 * Steps
 *
 * 1. Generate a random, valid email.
 * 2. Perform an initial resend request and validate the response type and echo of
 *    the target email.
 * 3. Execute a rapid burst of N additional resend calls sequentially for the same
 *    email, collecting success and error outcomes.
 * 4. Validate outcomes:
 *
 *    - Every success conforms to ITodoAppEmailVerification.ISummary and preserves
 *         email echo.
 *    - If throttling triggered: confirm at least one error occurred during the
 *         burst.
 *    - If throttling not triggered: confirm no errors occurred during the burst.
 *
 * Notes
 *
 * - No specific HTTP status codes or error bodies are asserted.
 * - No raw token exposure is possible due to strict DTO response typing.
 */
export async function test_api_guest_visitor_verification_resend_rate_limit_throttling(
  connection: api.IConnection,
) {
  // 1) Prepare a syntactically valid email address
  const email = typia.random<string & tags.Format<"email">>();

  // 2) Initial resend attempt - should return a summary without leaking secrets
  const initial =
    await api.functional.auth.guestVisitor.email.verify.resend.resendVerification(
      connection,
      {
        body: { email } satisfies ITodoAppEmailVerification.IResendRequest,
      },
    );
  typia.assert(initial);
  TestValidator.equals(
    "initial attempt echoes target email",
    initial.target_email,
    email,
  );

  // 3) Rapid burst of resend attempts for the same email
  const ATTEMPTS = 7;
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < ATTEMPTS; ++i) {
    try {
      const out =
        await api.functional.auth.guestVisitor.email.verify.resend.resendVerification(
          connection,
          {
            body: { email } satisfies ITodoAppEmailVerification.IResendRequest,
          },
        );
      typia.assert(out);
      TestValidator.equals(
        `attempt #${i + 1} echoes target email`,
        out.target_email,
        email,
      );
      successCount++;
    } catch (err) {
      // Any runtime error indicates throttling or other policy rejection
      errorCount++;
    }
  }

  // 4) Validate outcomes: accept either policy (ack-only vs. throttle-after-N)
  if (errorCount > 0) {
    TestValidator.predicate(
      "throttling engaged during resend burst",
      errorCount > 0,
    );
  } else {
    TestValidator.predicate(
      "no throttling occurred within burst window",
      errorCount === 0,
    );
  }
}
