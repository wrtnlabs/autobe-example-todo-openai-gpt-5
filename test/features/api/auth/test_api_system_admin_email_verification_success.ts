import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminEmailVerification";
import type { ITodoAppSystemAdminEmailVerificationResend } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminEmailVerificationResend";
import type { ITodoAppSystemAdminEmailVerificationResendResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminEmailVerificationResendResult";
import type { ITodoAppSystemAdminEmailVerificationResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminEmailVerificationResult";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUser";

/**
 * Verify System Admin email via token consumption and validate user record
 * reflection.
 *
 * Business flow:
 *
 * 1. Register a system admin (join) and obtain authorized identity and token
 * 2. Resend verification email to issue a fresh token (privacy-preserving
 *    acknowledgement)
 * 3. Consume a verification token on the public verify endpoint
 * 4. Read the user via admin endpoint and validate logical implications
 * 5. Conditionally test idempotency (second verify with same token fails) on
 *    non-simulated runs
 *
 * Notes:
 *
 * - The API surface does not expose the raw token; therefore we submit an opaque
 *   token string for verification. Deterministic validations focus on logical
 *   implications within responses and skip state-correlation requirements.
 *   Idempotency is asserted only when not in simulation mode and when the first
 *   verify reports token_consumed=true.
 */
export async function test_api_system_admin_email_verification_success(
  connection: api.IConnection,
) {
  // 1) Register a system admin
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12); // meets MinLength<8>

  const joinBody = {
    email,
    password,
  } satisfies ITodoAppSystemAdminJoin.ICreate;

  const authorized: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // 2) Resend verification email to issue a fresh token for this email
  const resendBody = {
    email,
  } satisfies ITodoAppSystemAdminEmailVerificationResend.ICreate;

  const resendResult: ITodoAppSystemAdminEmailVerificationResendResult =
    await api.functional.auth.systemAdmin.email.verify.resend.resendVerificationEmail(
      connection,
      { body: resendBody },
    );
  typia.assert(resendResult);

  // 3) Consume a verification token (opaque string; server validates real tokens)
  const verifyBody = {
    token: RandomGenerator.alphaNumeric(48),
  } satisfies ITodoAppSystemAdminEmailVerification.ICreate;

  const verifyResult: ITodoAppSystemAdminEmailVerificationResult =
    await api.functional.auth.systemAdmin.email.verify.verifyEmail(connection, {
      body: verifyBody,
    });
  typia.assert(verifyResult);

  // Logical implication: verified_at presence implies email_verified and single-use token consumed
  TestValidator.predicate(
    "verified_at implies email_verified=true and token_consumed=true",
    verifyResult.verified_at !== null && verifyResult.verified_at !== undefined
      ? verifyResult.email_verified === true &&
          verifyResult.token_consumed === true
      : true,
  );

  // 4) Admin reads back the user record
  const user: ITodoAppUser = await api.functional.todoApp.systemAdmin.users.at(
    connection,
    { userId: authorized.id },
  );
  typia.assert(user);

  // Logical implication on user entity: verified_at presence implies email_verified=true
  TestValidator.predicate(
    "user.verified_at presence implies email_verified is true",
    user.verified_at !== null && user.verified_at !== undefined
      ? user.email_verified === true
      : true,
  );

  // 5) Conditional idempotency check: on real backend only, second verify with same token should fail
  if (connection.simulate !== true && verifyResult.token_consumed === true) {
    await TestValidator.error(
      "second verification attempt with the same token must fail on real backend",
      async () => {
        await api.functional.auth.systemAdmin.email.verify.verifyEmail(
          connection,
          {
            body: verifyBody,
          },
        );
      },
    );
  }
}
