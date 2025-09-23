import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ITodoAppSystemAdminPasswordResetRequest } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminPasswordResetRequest";
import type { ITodoAppSystemAdminPasswordResetRequestResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminPasswordResetRequestResult";

/**
 * Privacy-preserving ack for unknown admin email password reset request.
 *
 * Purpose:
 *
 * - Ensure that submitting a password reset request for an arbitrary (likely
 *   non-existent) system-admin email produces a neutral acknowledgment without
 *   leaking whether the account exists and without exposing any token-like
 *   secret values.
 *
 * Steps:
 *
 * 1. Build a valid admin email using typia.random with email format tag.
 * 2. Submit POST /auth/systemAdmin/password/reset/request with that email.
 * 3. Validate response type using typia.assert (complete DTO conformance).
 * 4. Validate privacy: response must not include token-like fields.
 */
export async function test_api_system_admin_password_reset_request_unknown_email_privacy_ack(
  connection: api.IConnection,
) {
  // 1) Prepare a syntactically valid email
  const email = typia.random<string & tags.Format<"email">>();

  // 2) Submit password reset request with privacy-preserving design
  const body = {
    email,
  } satisfies ITodoAppSystemAdminPasswordResetRequest.ICreate;

  const ack =
    await api.functional.auth.systemAdmin.password.reset.request.requestPasswordReset(
      connection,
      { body },
    );

  // 3) Type-level validation (complete and perfect)
  typia.assert(ack);

  // 4) Business privacy: ensure no token-like fields are returned
  const forbidden = new Set<string>([
    "token",
    "rawToken",
    "resetToken",
    "token_hash",
    "tokenHash",
    "hash",
    "secret",
    "credential",
    "password",
  ]);
  const keys = Object.keys(ack);
  TestValidator.predicate(
    "acknowledgment should not leak sensitive token-like fields",
    keys.every((k) => !forbidden.has(k)),
  );
}
