import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoMvpGuest } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpGuest";

/**
 * Validate guest registration (join) returns tokens and consistent session
 * metadata.
 *
 * This test performs the minimal guest join flow and verifies:
 *
 * 1. Response conforms to ITodoMvpGuest.IAuthorized
 * 2. Non-empty access/refresh tokens are issued
 * 3. Token expiry timestamps are in the future, and refreshable_until >=
 *    expired_at
 * 4. Identity audit timestamps are consistent (updated_at >= created_at)
 * 5. Optional guest snapshot, when present, matches the top-level subject
 *
 * Notes:
 *
 * - Request body is intentionally empty per MVP (ITodoMvpGuest.ICreate = {})
 * - Type/format validations are covered by typia.assert(); additional checks
 *   focus on business logic
 * - No header manipulation or HTTP status code assertions
 */
export async function test_api_guest_auth_registration_tokens_and_session_metadata(
  connection: api.IConnection,
) {
  // Capture current time for future-bound checks
  const nowMs: number = Date.now();

  // 1) Execute guest join
  const authorized: ITodoMvpGuest.IAuthorized =
    await api.functional.auth.guest.join(connection, {
      body: {} satisfies ITodoMvpGuest.ICreate,
    });

  // 2) Type-level validation (checks all formats and structures perfectly)
  typia.assert(authorized);

  // 3) Business assertions on token payload
  TestValidator.predicate(
    "access token must be a non-empty string",
    authorized.token.access.length > 0,
  );
  TestValidator.predicate(
    "refresh token must be a non-empty string",
    authorized.token.refresh.length > 0,
  );

  const accessExpMs: number = Date.parse(authorized.token.expired_at);
  const refreshableUntilMs: number = Date.parse(
    authorized.token.refreshable_until,
  );

  TestValidator.predicate(
    "access token expiry must be in the future",
    accessExpMs > nowMs,
  );
  TestValidator.predicate(
    "refreshable_until must be same or later than access expiry",
    refreshableUntilMs >= accessExpMs,
  );

  // 4) Audit timestamps consistency
  const createdMs: number = Date.parse(authorized.created_at);
  const updatedMs: number = Date.parse(authorized.updated_at);
  TestValidator.predicate(
    "identity updated_at must be equal or later than created_at",
    updatedMs >= createdMs,
  );

  // 5) Optional guest snapshot should mirror subject fields when provided
  if (authorized.guest !== undefined) {
    typia.assert(authorized.guest);
    TestValidator.equals(
      "guest snapshot id matches subject id",
      authorized.guest.id,
      authorized.id,
    );
    TestValidator.equals(
      "guest snapshot created_at matches subject created_at",
      authorized.guest.created_at,
      authorized.created_at,
    );
    TestValidator.equals(
      "guest snapshot updated_at matches subject updated_at",
      authorized.guest.updated_at,
      authorized.updated_at,
    );
  }
}
