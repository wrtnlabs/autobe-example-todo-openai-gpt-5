import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminEmailVerificationResend } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminEmailVerificationResend";
import type { ITodoAppSystemAdminEmailVerificationResendResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminEmailVerificationResendResult";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Resend verification email for an unverified system admin account.
 *
 * Purpose:
 *
 * - Ensure a newly joined (unverified) system admin can request a resend of the
 *   verification email.
 * - Validate the resend endpoint responds with a privacy-preserving
 *   acknowledgment and does not leak sensitive tokens.
 *
 * Flow:
 *
 * 1. Register a system admin via POST /auth/systemAdmin/join.
 * 2. Call POST /auth/systemAdmin/email/verify/resend with the same email using an
 *    unauthenticated connection.
 * 3. Validate response typing and business rules:
 *
 *    - Typia.assert on the resend result structure.
 *    - No token field exists in the resend response (security/privacy).
 *    - Acknowledged flag should be true.
 */
export async function test_api_system_admin_email_verification_resend_for_unverified_account(
  connection: api.IConnection,
) {
  // 1) Register a new system admin (unverified by policy)
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12); // 8~64 chars

  const authorized = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email,
      password,
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(authorized);

  // 2) Use a fresh unauthenticated connection for resend (endpoint is public)
  const anonymous: api.IConnection = { ...connection, headers: {} };

  const resendResult =
    await api.functional.auth.systemAdmin.email.verify.resend.resendVerificationEmail(
      anonymous,
      {
        body: {
          email,
        } satisfies ITodoAppSystemAdminEmailVerificationResend.ICreate,
      },
    );
  typia.assert(resendResult);

  // 3) Business/security validations
  TestValidator.predicate(
    "resend response does not leak token field",
    !("token" in resendResult),
  );
  TestValidator.predicate(
    "resend request is acknowledged",
    resendResult.acknowledged === true,
  );
}
