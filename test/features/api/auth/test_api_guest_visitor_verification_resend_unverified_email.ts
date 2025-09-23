import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEmailVerification";
import type { ITodoAppGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppGuestVisitor";

/**
 * Resend verification for an unverified guest email and ensure new record
 * creation.
 *
 * Business flow:
 *
 * 1. Join as a guestVisitor with an email (unverified state is implied).
 * 2. From a public (unauthenticated) connection, call the resend verification
 *    endpoint.
 * 3. Validate returned summary targets the same email and does not expose any
 *    secret token (type-level guarantee).
 * 4. Repeat resend and ensure a new, distinct verification record is produced,
 *    with non-decreasing timestamps.
 *
 * Notes:
 *
 * - We do not check internal DB rows nor email_verified flag due to missing read
 *   APIs. We validate via public response semantics instead.
 */
export async function test_api_guest_visitor_verification_resend_unverified_email(
  connection: api.IConnection,
) {
  // 1) Create a guestVisitor with an email (unverified state implied)
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();

  const joinAuthorized = await api.functional.auth.guestVisitor.join(
    connection,
    {
      body: {
        email,
      } satisfies ITodoAppGuestVisitor.IJoin,
    },
  );
  typia.assert(joinAuthorized);

  // 2) Create an unauthenticated connection for public resend
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // Helper to parse ISO timestamps to numbers for comparison
  const toMillis = (iso: string): number => Date.parse(iso);

  // 3) First resend request
  const first =
    await api.functional.auth.guestVisitor.email.verify.resend.resendVerification(
      unauthConn,
      {
        body: {
          email,
        } satisfies ITodoAppEmailVerification.IResendRequest,
      },
    );
  typia.assert(first);

  TestValidator.equals(
    "first resend targets the same email",
    first.target_email,
    email,
  );

  // 4) Second resend request to ensure distinct record and non-decreasing times
  const second =
    await api.functional.auth.guestVisitor.email.verify.resend.resendVerification(
      unauthConn,
      {
        body: {
          email,
        } satisfies ITodoAppEmailVerification.IResendRequest,
      },
    );
  typia.assert(second);

  TestValidator.equals(
    "second resend targets the same email",
    second.target_email,
    email,
  );

  TestValidator.notEquals(
    "second resend creates a distinct verification id",
    second.id,
    first.id,
  );

  TestValidator.predicate(
    "sent_at of second is not earlier than first",
    toMillis(second.sent_at) >= toMillis(first.sent_at),
  );
  TestValidator.predicate(
    "expires_at of second is not earlier than first",
    toMillis(second.expires_at) >= toMillis(first.expires_at),
  );
}
