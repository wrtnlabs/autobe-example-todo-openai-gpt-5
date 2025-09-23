import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ITodoAppSystemAdminPasswordResetRequest } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminPasswordResetRequest";
import type { ITodoAppSystemAdminPasswordResetRequestResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminPasswordResetRequestResult";

/**
 * Verify invalid email format is rejected for system admin password reset
 * request.
 *
 * Business rules:
 *
 * - The endpoint accepts an email and must not disclose account existence.
 * - The email must be syntactically valid (tags.Format<"email">).
 *
 * Test procedure:
 *
 * 1. Attempt to create a password reset request using a malformed email string (no
 *    '@').
 * 2. Expect the API to throw a validation error.
 *
 * Notes:
 *
 * - We only verify that an error occurs (no status/message inspection).
 * - We do not perform type-violation tests; we use a string type with invalid
 *   email format.
 */
export async function test_api_system_admin_password_reset_request_invalid_email_format_validation_error(
  connection: api.IConnection,
) {
  // 1) Prepare a malformed email (no '@') to violate email format.
  const invalidEmail: string = `${RandomGenerator.alphabets(8)}.example.com`;

  // 2) Expect validation error when requesting password reset with malformed email.
  await TestValidator.error(
    "malformed email should be rejected by password reset request",
    async () => {
      await api.functional.auth.systemAdmin.password.reset.request.requestPasswordReset(
        connection,
        {
          body: {
            email: invalidEmail,
          } satisfies ITodoAppSystemAdminPasswordResetRequest.ICreate,
        },
      );
    },
  );
}
