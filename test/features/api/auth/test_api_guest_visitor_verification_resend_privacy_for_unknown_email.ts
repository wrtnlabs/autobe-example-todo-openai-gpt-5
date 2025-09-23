import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ITodoAppEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEmailVerification";

/**
 * Privacy-preserving resend for unknown email.
 *
 * This test validates that a public guest can request a resend of an email
 * verification for an address that is not associated with any user account, and
 * the server returns a generic acknowledgment that does not disclose existence.
 * The response shape must be indistinguishable from the known-email case.
 *
 * Steps:
 *
 * 1. Generate two random, syntactically valid emails that are presumed unknown.
 * 2. POST /auth/guestVisitor/email/verify/resend for each email.
 * 3. Validate response typing (ISummary), temporal integrity (expires_at >=
 *    sent_at), non-consumed state (consumed_at is nullish), and echo of
 *    target_email.
 * 4. Validate that different requests yield different verification ids.
 */
export async function test_api_guest_visitor_verification_resend_privacy_for_unknown_email(
  connection: api.IConnection,
) {
  // 1) Prepare two distinct unknown emails
  const unknownEmailA = typia.random<string & tags.Format<"email">>();
  const unknownEmailB = typia.random<string & tags.Format<"email">>();

  // 2) Call resend for A
  const summaryA =
    await api.functional.auth.guestVisitor.email.verify.resend.resendVerification(
      connection,
      {
        body: {
          email: unknownEmailA,
        } satisfies ITodoAppEmailVerification.IResendRequest,
      },
    );
  typia.assert(summaryA);

  // 3) Validate basic properties for A
  TestValidator.equals(
    "target_email echoes the submitted A email",
    summaryA.target_email,
    unknownEmailA,
  );
  TestValidator.predicate(
    "A.consumed_at is nullish (not yet consumed)",
    summaryA.consumed_at === null || summaryA.consumed_at === undefined,
  );
  {
    const sentAtA = Date.parse(summaryA.sent_at);
    const expiresAtA = Date.parse(summaryA.expires_at);
    TestValidator.predicate(
      "A.expires_at occurs at or after sent_at",
      Number.isFinite(sentAtA) &&
        Number.isFinite(expiresAtA) &&
        expiresAtA >= sentAtA,
    );
    TestValidator.predicate(
      "A.failure_count is non-negative",
      summaryA.failure_count >= 0,
    );
  }

  // 4) Call resend for B
  const summaryB =
    await api.functional.auth.guestVisitor.email.verify.resend.resendVerification(
      connection,
      {
        body: {
          email: unknownEmailB,
        } satisfies ITodoAppEmailVerification.IResendRequest,
      },
    );
  typia.assert(summaryB);

  // 5) Validate basic properties for B
  TestValidator.equals(
    "target_email echoes the submitted B email",
    summaryB.target_email,
    unknownEmailB,
  );
  TestValidator.predicate(
    "B.consumed_at is nullish (not yet consumed)",
    summaryB.consumed_at === null || summaryB.consumed_at === undefined,
  );
  {
    const sentAtB = Date.parse(summaryB.sent_at);
    const expiresAtB = Date.parse(summaryB.expires_at);
    TestValidator.predicate(
      "B.expires_at occurs at or after sent_at",
      Number.isFinite(sentAtB) &&
        Number.isFinite(expiresAtB) &&
        expiresAtB >= sentAtB,
    );
    TestValidator.predicate(
      "B.failure_count is non-negative",
      summaryB.failure_count >= 0,
    );
  }

  // 6) Validate distinct verification records (no leakage but unique identifiers)
  TestValidator.notEquals(
    "verification ids for A and B must differ",
    summaryA.id,
    summaryB.id,
  );
}
