import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ITodoAppSystemAdminEmailVerificationResend } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminEmailVerificationResend";
import type { ITodoAppSystemAdminEmailVerificationResendResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminEmailVerificationResendResult";

/**
 * Privacy-preserving resend of System Admin verification email with unknown
 * address.
 *
 * This test ensures that the public endpoint for resending a system admin email
 * verification behaves in a privacy-preserving manner. When supplied with an
 * email address that likely does not exist in the system, the server must
 * acknowledge the request generically without revealing whether the account
 * exists.
 *
 * Steps
 *
 * 1. Create an unauthenticated connection to confirm the endpoint is public.
 * 2. Generate a random email that is unlikely to exist in the system.
 * 3. Call the resend endpoint with the ICreate DTO via `satisfies`.
 * 4. Validate the response structure with typia.assert (complete type validation).
 * 5. Business privacy checks: ensure response does not echo back the submitted
 *    email nor expose token-like fields (e.g., token, token_hash, tokenHash,
 *    email, target_email).
 *
 * Notes
 *
 * - Do not validate HTTP status codes directly; success is implied if no error is
 *   thrown.
 * - Do not perform redundant type/format checks after typia.assert.
 */
export async function test_api_system_admin_email_verification_resend_privacy_preserving_unknown_email(
  connection: api.IConnection,
) {
  // 1) Unauthenticated connection (public endpoint)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 2) Random, likely-unknown email
  const unknownEmail = typia.random<string & tags.Format<"email">>();

  // 3) Build request body using the exact ICreate DTO type with `satisfies`
  const body = {
    email: unknownEmail,
  } satisfies ITodoAppSystemAdminEmailVerificationResend.ICreate;

  // 4) Call endpoint and validate the response type
  const output =
    await api.functional.auth.systemAdmin.email.verify.resend.resendVerificationEmail(
      unauthConn,
      { body },
    );
  typia.assert(output);

  // 5) Privacy checks: ensure no sensitive fields are exposed or email is echoed back
  const hasSensitiveKeys =
    Object.prototype.hasOwnProperty.call(output, "email") ||
    Object.prototype.hasOwnProperty.call(output, "target_email") ||
    Object.prototype.hasOwnProperty.call(output, "token") ||
    Object.prototype.hasOwnProperty.call(output, "token_hash") ||
    Object.prototype.hasOwnProperty.call(output, "tokenHash");
  TestValidator.predicate(
    "response should not disclose sensitive credentials or echo the submitted email",
    hasSensitiveKeys === false,
  );
}
