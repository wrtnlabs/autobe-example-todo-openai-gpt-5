import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { IEAdminStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAdminStatus";
import type { ITodoMvpAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdmin";
import type { ITodoMvpAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdminJoin";

/**
 * Validate successful administrator registration issues tokens and returns
 * admin metadata.
 *
 * Steps
 *
 * 1. Prepare a unique admin email and strong password
 * 2. Call POST /auth/admin/join
 * 3. Assert response type and core business invariants
 *
 *    - Email in response equals input
 *    - Token fields exist and are non-empty
 *    - Updated_at is not earlier than created_at
 *    - Token refreshable window is not earlier than token expiration
 *    - If embedded admin metadata exists, id/email match the subject
 *
 * Notes
 *
 * - SDK auto-manages Authorization headers; do not touch connection.headers
 * - No HTTP status code assertions; rely on typia.assert for structural checks
 */
export async function test_api_admin_registration_success(
  connection: api.IConnection,
) {
  // 1) Prepare unique email and strong password
  const email = typia.random<string & tags.Format<"email">>();
  const password = RandomGenerator.alphaNumeric(12); // >= 8 chars
  const body = {
    email,
    password,
  } satisfies ITodoMvpAdminJoin.ICreate;

  // 2) Execute join
  const authorized: ITodoMvpAdmin.IAuthorized =
    await api.functional.auth.admin.join(connection, { body });

  // 3) Type assertion and business validations
  typia.assert<ITodoMvpAdmin.IAuthorized>(authorized);

  // Email echoed back correctly
  TestValidator.equals(
    "email in authorization payload matches input",
    authorized.email,
    body.email,
  );

  // Tokens are non-empty strings
  TestValidator.predicate(
    "access token should be non-empty",
    authorized.token.access.length > 0,
  );
  TestValidator.predicate(
    "refresh token should be non-empty",
    authorized.token.refresh.length > 0,
  );

  // Timestamp monotonicity: updated_at >= created_at
  const createdAtMs = new Date(authorized.created_at).getTime();
  const updatedAtMs = new Date(authorized.updated_at).getTime();
  TestValidator.predicate(
    "updated_at is not earlier than created_at",
    updatedAtMs >= createdAtMs,
  );

  // Token temporal sanity: refreshable_until >= expired_at
  const tokenExpiredAt = new Date(authorized.token.expired_at).getTime();
  const tokenRefreshableUntil = new Date(
    authorized.token.refreshable_until,
  ).getTime();
  TestValidator.predicate(
    "token refreshable window is not earlier than expiration",
    tokenRefreshableUntil >= tokenExpiredAt,
  );

  // Optional embedded admin metadata consistency
  if (authorized.admin !== undefined) {
    typia.assert(authorized.admin);
    TestValidator.equals(
      "embedded admin id matches subject id",
      authorized.admin.id,
      authorized.id,
    );
    TestValidator.equals(
      "embedded admin email matches subject email",
      authorized.admin.email,
      authorized.email,
    );
  }
}
