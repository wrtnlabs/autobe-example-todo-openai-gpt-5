import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEmailVerification";
import type { ITodoAppGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppGuestVisitor";

export async function test_api_guest_visitor_email_verification_success_with_resend_token(
  connection: api.IConnection,
) {
  // Validate happy-path email verification for a guest visitor using available endpoints.
  // Flow: join → resend → verify (with a synthetic opaque token). Assertions rely on typia.assert.

  // 1) Generate a valid email for the guest account
  const email = typia.random<string & tags.Format<"email">>();

  // 2) Join as a guest visitor with the email
  const joinBody = {
    email,
  } satisfies ITodoAppGuestVisitor.IJoin;
  const authorized: ITodoAppGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.join(connection, { body: joinBody });
  typia.assert(authorized);

  // 3) Resend verification to create a fresh token for the email
  const resendBody = {
    email,
  } satisfies ITodoAppEmailVerification.IResendRequest;
  const resendSummary: ITodoAppEmailVerification.ISummary =
    await api.functional.auth.guestVisitor.email.verify.resend.resendVerification(
      connection,
      { body: resendBody },
    );
  typia.assert(resendSummary);

  // 4) Confirm email verification with an opaque token string (no token retrieval API available)
  const token: string = RandomGenerator.alphaNumeric(64);
  const confirmBody = {
    token,
  } satisfies ITodoAppEmailVerification.IConfirm;
  const confirmSummary: ITodoAppEmailVerification.ISummary =
    await api.functional.auth.guestVisitor.email.verify.verifyEmail(
      connection,
      {
        body: confirmBody,
      },
    );
  typia.assert(confirmSummary);

  // Note: Negative retry and DB flag validations are omitted due to simulator randomness
  // and absence of an API to fetch the real plaintext token.
}
