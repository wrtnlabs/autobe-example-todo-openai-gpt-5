import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoMvpGuest } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpGuest";

export async function test_api_guest_auth_multiple_joins_create_independent_sessions(
  connection: api.IConnection,
) {
  /**
   * Validate that multiple guest joins create separate guest
   * identities/sessions.
   *
   * Steps:
   *
   * 1. Create two isolated connections (connA, connB) derived from the base
   *    connection with empty headers.
   * 2. Call POST /auth/guest/join on each connection with an empty body (MVP join
   *    has no client-provided fields).
   * 3. Assert response types and basic business properties:
   *
   *    - Distinct guest IDs (no collision)
   *    - Distinct access/refresh tokens
   *    - Created_at and updated_at are valid ISO and updated_at >= created_at
   *    - Optional guest snapshot mirrors id/created_at/updated_at
   * 4. Call join again on connA to ensure repeated joins still produce new
   *    identities.
   */

  // 1) Prepare isolated connections without touching original headers afterward
  const connA: api.IConnection = { ...connection, headers: {} };
  const connB: api.IConnection = { ...connection, headers: {} };

  // 2) Perform guest joins with empty MVP body
  const auth1 = await api.functional.auth.guest.join(connA, {
    body: {} satisfies ITodoMvpGuest.ICreate,
  });
  typia.assert(auth1);

  const auth2 = await api.functional.auth.guest.join(connB, {
    body: {} satisfies ITodoMvpGuest.ICreate,
  });
  typia.assert(auth2);

  // 3) Validate independence: different identities and tokens
  TestValidator.notEquals(
    "guest ids must differ between two independent joins",
    auth1.id,
    auth2.id,
  );
  TestValidator.notEquals(
    "access tokens must differ between sessions",
    auth1.token.access,
    auth2.token.access,
  );
  TestValidator.notEquals(
    "refresh tokens must differ between sessions",
    auth1.token.refresh,
    auth2.token.refresh,
  );

  // Business time ordering: updated_at should not be earlier than created_at
  TestValidator.predicate(
    "auth1: updated_at is not earlier than created_at",
    Date.parse(auth1.updated_at) >= Date.parse(auth1.created_at),
  );
  TestValidator.predicate(
    "auth2: updated_at is not earlier than created_at",
    Date.parse(auth2.updated_at) >= Date.parse(auth2.created_at),
  );

  // Optional guest snapshot consistency checks
  if (auth1.guest !== undefined) {
    typia.assertGuard<ITodoMvpGuest>(auth1.guest!);
    TestValidator.equals(
      "auth1: guest snapshot id equals top-level id",
      auth1.guest.id,
      auth1.id,
    );
    TestValidator.equals(
      "auth1: guest snapshot created_at equals top-level created_at",
      auth1.guest.created_at,
      auth1.created_at,
    );
    TestValidator.equals(
      "auth1: guest snapshot updated_at equals top-level updated_at",
      auth1.guest.updated_at,
      auth1.updated_at,
    );
  }
  if (auth2.guest !== undefined) {
    typia.assertGuard<ITodoMvpGuest>(auth2.guest!);
    TestValidator.equals(
      "auth2: guest snapshot id equals top-level id",
      auth2.guest.id,
      auth2.id,
    );
    TestValidator.equals(
      "auth2: guest snapshot created_at equals top-level created_at",
      auth2.guest.created_at,
      auth2.created_at,
    );
    TestValidator.equals(
      "auth2: guest snapshot updated_at equals top-level updated_at",
      auth2.guest.updated_at,
      auth2.updated_at,
    );
  }

  // 4) Repeat join on connA to ensure additional joins still produce new identity
  const auth1b = await api.functional.auth.guest.join(connA, {
    body: {} satisfies ITodoMvpGuest.ICreate,
  });
  typia.assert(auth1b);

  TestValidator.notEquals(
    "repeated join on same connection must create a new guest id",
    auth1b.id,
    auth1.id,
  );
  TestValidator.notEquals(
    "repeated join on same connection must issue a new access token",
    auth1b.token.access,
    auth1.token.access,
  );
  TestValidator.predicate(
    "auth1b: updated_at is not earlier than created_at",
    Date.parse(auth1b.updated_at) >= Date.parse(auth1b.created_at),
  );
}
