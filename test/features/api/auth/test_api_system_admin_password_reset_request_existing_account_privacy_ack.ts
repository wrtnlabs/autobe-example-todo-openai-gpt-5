import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppSystemAdminPasswordResetRequest } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminPasswordResetRequest";
import type { ITodoAppSystemAdminPasswordResetRequestResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminPasswordResetRequestResult";

/**
 * Privacy-preserving password reset acknowledgment for existing admin email.
 *
 * This test ensures that when a system administrator account exists and a
 * password reset request is issued for its email, the API responds with a
 * neutral, privacy-preserving acknowledgment that does not disclose whether the
 * email exists nor any reset token values.
 *
 * Steps:
 *
 * 1. Register a system admin with a valid email and password.
 * 2. Request a password reset for that same email.
 * 3. Validate that the response is an acknowledgment (accepted = true) and that no
 *    sensitive info is disclosed (no token exposure; message—if present— must
 *    not include the submitted email).
 * 4. Request a password reset for a different, random email to ensure the same
 *    acceptance semantics apply, validating privacy across
 *    existence/non-existence.
 */
export async function test_api_system_admin_password_reset_request_existing_account_privacy_ack(
  connection: api.IConnection,
) {
  // 1) Register a system admin
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
    // Optional client hints for analytics/audit; not required
    user_agent: RandomGenerator.paragraph({ sentences: 3 }),
  } satisfies ITodoAppSystemAdminJoin.ICreate;

  const authorized = await api.functional.auth.systemAdmin.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);

  // 2) Request password reset for the existing email
  const ackExisting =
    await api.functional.auth.systemAdmin.password.reset.request.requestPasswordReset(
      connection,
      {
        body: {
          email: joinBody.email,
        } satisfies ITodoAppSystemAdminPasswordResetRequest.ICreate,
      },
    );
  typia.assert(ackExisting);

  // Business validations: acceptance semantics and privacy signal checks
  TestValidator.equals(
    "ack accepted for existing system admin email",
    ackExisting.accepted,
    true,
  );
  if (ackExisting.message !== undefined) {
    TestValidator.predicate(
      "ack message for existing email does not include the email address",
      ackExisting.message.includes(joinBody.email) === false,
    );
  }

  // 3) Request password reset for a non-existent (random) email to validate
  //    privacy-preserving uniformity
  const unknownEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const ackUnknown =
    await api.functional.auth.systemAdmin.password.reset.request.requestPasswordReset(
      connection,
      {
        body: {
          email: unknownEmail,
        } satisfies ITodoAppSystemAdminPasswordResetRequest.ICreate,
      },
    );
  typia.assert(ackUnknown);

  // Both responses should reflect identical acceptance semantics
  TestValidator.equals(
    "accepted semantics are equal for existing and unknown email",
    ackExisting.accepted,
    ackUnknown.accepted,
  );
  TestValidator.equals(
    "ack accepted for unknown email (privacy-preserving)",
    ackUnknown.accepted,
    true,
  );
  if (ackUnknown.message !== undefined) {
    TestValidator.predicate(
      "ack message for unknown email does not include the submitted email",
      ackUnknown.message.includes(unknownEmail) === false,
    );
  }
}
