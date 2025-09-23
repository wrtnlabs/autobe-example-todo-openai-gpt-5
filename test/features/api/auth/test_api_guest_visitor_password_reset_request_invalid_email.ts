import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { ITodoAppPasswordReset } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPasswordReset";

/**
 * Validate guest-initiated password reset request with a valid email.
 *
 * Business goal: Ensure an unauthenticated (guest) user can initiate a password
 * reset without revealing account existence and that the response contains only
 * safe, non-sensitive metadata.
 *
 * Why rewritten: The original plan suggested an invalid-email 4xx test, but E2E
 * rules strictly forbid deliberate type/format error testing. Therefore, this
 * test validates the happy path with a valid email instead.
 *
 * Steps:
 *
 * 1. Create an unauthenticated connection (empty headers, then no further
 *    manipulation).
 * 2. Generate a valid email string.
 * 3. POST /auth/guestVisitor/password/reset/request with { email }.
 * 4. Assert the response strictly matches ITodoAppPasswordReset.ISummary via
 *    typia.assert.
 */
export async function test_api_guest_visitor_password_reset_request_invalid_email(
  connection: api.IConnection,
) {
  // 1) Use an unauthenticated connection (no header manipulation after creation)
  const guestConn: api.IConnection = { ...connection, headers: {} };

  // 2) Prepare a valid email
  const email = typia.random<string & tags.Format<"email">>();

  // 3) Initiate password reset request with a valid email only
  const summary =
    await api.functional.auth.guestVisitor.password.reset.request.requestPasswordReset(
      guestConn,
      {
        body: {
          email,
        } satisfies ITodoAppPasswordReset.IRequest,
      },
    );

  // 4) Response must conform exactly to ISummary (uuid id, date-time timestamps, etc.)
  typia.assert<ITodoAppPasswordReset.ISummary>(summary);
}
