import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppGuestVisitor";

/**
 * Guest visitor registration with email: success flow and token lifecycle
 * validation.
 *
 * Business goal
 *
 * - Ensure a guestVisitor can join with an optional email and immediately obtain
 *   authorization credentials for subsequent authenticated requests.
 * - Validate token integrity and temporal coherence without accessing headers or
 *   testing type-level validation failures.
 *
 * What is validated
 *
 * 1. Successful join returns ITodoAppGuestVisitor.IAuthorized.
 * 2. Token.access and token.refresh are non-empty strings (opaque tokens).
 * 3. Token.expired_at is in the future; token.refreshable_until is after
 *    expired_at.
 * 4. Repeating join with a different email yields a distinct subject and tokens.
 *
 * Not validated (intentionally omitted due to API/DTO scope & constraints)
 *
 * - Email_verified or user/session metadata (not exposed in IAuthorized).
 * - HTTP status codes and error message details.
 * - Any manipulation or inspection of connection.headers (SDK-managed only).
 */
export async function test_api_guest_visitor_registration_with_email(
  connection: api.IConnection,
) {
  // 1) Join with a valid email
  const email1 = typia.random<string & tags.Format<"email">>();
  const body1 = { email: email1 } satisfies ITodoAppGuestVisitor.IJoin;

  const auth1 = await api.functional.auth.guestVisitor.join(connection, {
    body: body1,
  });
  typia.assert<ITodoAppGuestVisitor.IAuthorized>(auth1);

  // 2) Validate token presence and time coherence
  const now1 = new Date();
  const accessExpiry1 = new Date(auth1.token.expired_at);
  const refreshUntil1 = new Date(auth1.token.refreshable_until);

  TestValidator.predicate(
    "access token should be a non-empty string",
    auth1.token.access.length > 0,
  );
  TestValidator.predicate(
    "refresh token should be a non-empty string",
    auth1.token.refresh.length > 0,
  );
  TestValidator.predicate(
    "access token expiry must be in the future",
    accessExpiry1.getTime() > now1.getTime(),
  );
  TestValidator.predicate(
    "refreshable_until must be after access expiry",
    refreshUntil1.getTime() > accessExpiry1.getTime(),
  );

  // 3) Join again with a different email to ensure distinct identity/session
  const email2 = typia.random<string & tags.Format<"email">>();
  const body2 = { email: email2 } satisfies ITodoAppGuestVisitor.IJoin;

  const auth2 = await api.functional.auth.guestVisitor.join(connection, {
    body: body2,
  });
  typia.assert<ITodoAppGuestVisitor.IAuthorized>(auth2);

  const now2 = new Date();
  const accessExpiry2 = new Date(auth2.token.expired_at);
  const refreshUntil2 = new Date(auth2.token.refreshable_until);

  // Distinct identity and tokens
  TestValidator.notEquals(
    "second join should issue a different subject id",
    auth2.id,
    auth1.id,
  );
  TestValidator.notEquals(
    "second join should issue a different access token",
    auth2.token.access,
    auth1.token.access,
  );
  TestValidator.notEquals(
    "second join should issue a different refresh token",
    auth2.token.refresh,
    auth1.token.refresh,
  );

  // Token coherence for the second authorization
  TestValidator.predicate(
    "access token 2 should be a non-empty string",
    auth2.token.access.length > 0,
  );
  TestValidator.predicate(
    "refresh token 2 should be a non-empty string",
    auth2.token.refresh.length > 0,
  );
  TestValidator.predicate(
    "access token 2 expiry must be in the future",
    accessExpiry2.getTime() > now2.getTime(),
  );
  TestValidator.predicate(
    "refreshable_until 2 must be after access expiry 2",
    refreshUntil2.getTime() > accessExpiry2.getTime(),
  );
}
