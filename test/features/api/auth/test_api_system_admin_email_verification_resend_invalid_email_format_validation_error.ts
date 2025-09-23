import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ITodoAppSystemAdminEmailVerificationResend } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminEmailVerificationResend";
import type { ITodoAppSystemAdminEmailVerificationResendResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminEmailVerificationResendResult";

/**
 * Validate input format error when resending System Admin email verification.
 *
 * Scenario:
 *
 * - Submitting an invalid email string must cause a validation error, without
 *   revealing whether an account exists. Do not check HTTP status codes; only
 *   assert that an error occurs.
 * - Also perform a happy-path call using a valid email to ensure endpoint
 *   responds with the acknowledgment result shape.
 *
 * Steps:
 *
 * 1. Call resend with an invalid email (e.g., "invalid-email") and expect error.
 * 2. Call resend with a valid email and typia.assert() the response.
 */
export async function test_api_system_admin_email_verification_resend_invalid_email_format_validation_error(
  connection: api.IConnection,
) {
  // 1) Invalid email -> expect error
  const invalidBody = {
    email: "invalid-email",
  } satisfies ITodoAppSystemAdminEmailVerificationResend.ICreate;

  await TestValidator.error(
    "invalid email format should be rejected",
    async () => {
      await api.functional.auth.systemAdmin.email.verify.resend.resendVerificationEmail(
        connection,
        { body: invalidBody },
      );
    },
  );

  // 2) Valid email -> expect success response shape
  const validBody = {
    email: typia.random<string & tags.Format<"email">>(),
  } satisfies ITodoAppSystemAdminEmailVerificationResend.ICreate;

  const ok: ITodoAppSystemAdminEmailVerificationResendResult =
    await api.functional.auth.systemAdmin.email.verify.resend.resendVerificationEmail(
      connection,
      { body: validBody },
    );
  typia.assert(ok);
}
