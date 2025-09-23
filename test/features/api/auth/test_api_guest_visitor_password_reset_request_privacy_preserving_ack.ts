import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppGuestVisitor";
import type { ITodoAppPasswordReset } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPasswordReset";

export async function test_api_guest_visitor_password_reset_request_privacy_preserving_ack(
  connection: api.IConnection,
) {
  /**
   * Validate privacy-preserving password reset acknowledgments.
   *
   * Steps:
   *
   * 1. Generate two distinct emails E1 and E2 (E2 != E1).
   * 2. Join a guest visitor with E1 (dependency setup).
   * 3. Initiate password reset for E1.
   * 4. Initiate password reset for non-existent E2.
   * 5. Validate:
   *
   *    - Both responses conform to ISummary type (typia.assert).
   *    - No token exposure in acknowledgment objects.
   *    - Echoed email equals request email for each call.
   *    - Expires_at is later than requested_at for both.
   *    - Acknowledgments differ by ID (not literally identical objects) but share
   *         the same schema.
   *
   * Notes:
   *
   * - Do not validate HTTP status codes.
   * - Avoid touching connection.headers directly. Use cloned connections when
   *   necessary.
   */

  // Prepare distinct emails
  const email1 = typia.random<string & tags.Format<"email">>();
  let email2 = typia.random<string & tags.Format<"email">>();
  while (email2 === email1)
    email2 = typia.random<string & tags.Format<"email">>();

  // Create isolated connections to avoid mutating the input connection
  const joinConn: api.IConnection = { ...connection, headers: {} }; // will be mutated by SDK internally (ok)
  const publicConn: api.IConnection = { ...connection, headers: {} }; // used for unauthenticated reset requests

  // 1) Dependency: Join guest visitor with E1
  const joined = await api.functional.auth.guestVisitor.join(joinConn, {
    body: {
      email: email1,
    } satisfies ITodoAppGuestVisitor.IJoin,
  });
  typia.assert(joined);

  // 2) Request reset with E1 (existing account)
  const ack1 =
    await api.functional.auth.guestVisitor.password.reset.request.requestPasswordReset(
      publicConn,
      {
        body: {
          email: email1,
        } satisfies ITodoAppPasswordReset.IRequest,
      },
    );
  typia.assert(ack1);

  // 3) Request reset with E2 (non-existent account)
  const ack2 =
    await api.functional.auth.guestVisitor.password.reset.request.requestPasswordReset(
      publicConn,
      {
        body: {
          email: email2,
        } satisfies ITodoAppPasswordReset.IRequest,
      },
    );
  typia.assert(ack2);

  // Validate echoed emails
  TestValidator.equals("ack1 echoes input email1", ack1.email, email1);
  TestValidator.equals("ack2 echoes input email2", ack2.email, email2);

  // Validate absence of token exposure
  TestValidator.predicate(
    "ack1 must not expose token field",
    !("token" in ack1),
  );
  TestValidator.predicate(
    "ack2 must not expose token field",
    !("token" in ack2),
  );

  // Validate sensible temporal ordering
  const r1 = new Date(ack1.requested_at).getTime();
  const e1 = new Date(ack1.expires_at).getTime();
  const r2 = new Date(ack2.requested_at).getTime();
  const e2 = new Date(ack2.expires_at).getTime();
  TestValidator.predicate("ack1 expires after requested", e1 > r1);
  TestValidator.predicate("ack2 expires after requested", e2 > r2);

  // Validate that the two acknowledgments are distinct objects (IDs differ)
  TestValidator.notEquals(
    "ack1 and ack2 should have different IDs",
    ack1.id,
    ack2.id,
  );

  // Optional: new requests should be unconsumed initially (null or undefined)
  TestValidator.predicate(
    "ack1 consumed_at is null or undefined",
    ack1.consumed_at === null || ack1.consumed_at === undefined,
  );
  TestValidator.predicate(
    "ack2 consumed_at is null or undefined",
    ack2.consumed_at === null || ack2.consumed_at === undefined,
  );
}
