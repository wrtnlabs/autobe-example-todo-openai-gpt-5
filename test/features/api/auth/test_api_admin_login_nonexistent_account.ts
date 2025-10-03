import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { IEAdminStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAdminStatus";
import type { ITodoMvpAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdmin";
import type { ITodoMvpAdminLogin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdminLogin";

/**
 * Reject login for a non-existent admin account.
 *
 * Purpose:
 *
 * - Ensure POST /auth/admin/login securely fails when provided with credentials
 *   for an email that does not correspond to any administrator account.
 * - Do not inspect status codes or error messages; only assert that an error
 *   occurs.
 * - Do not touch connection.headers beyond creating a fresh unauthenticated
 *   connection.
 *
 * Steps:
 *
 * 1. Create a fresh unauthenticated connection with simulation disabled to ensure
 *    real backend behavior (no mock success from SDK simulate mode).
 * 2. Generate a random email and password that have never been registered.
 * 3. Call api.functional.auth.admin.login with those credentials and assert that
 *    it throws.
 */
export async function test_api_admin_login_nonexistent_account(
  connection: api.IConnection,
) {
  // 1) Fresh unauthenticated connection with simulation disabled
  const unauthConn: api.IConnection = {
    ...connection,
    headers: {},
    simulate: false,
  };

  // 2) Random, non-existent credentials (properly typed)
  const credentials = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(16),
  } satisfies ITodoMvpAdminLogin.ICreate;

  // 3) Attempt login and expect an error (no status/message inspection)
  await TestValidator.error(
    "non-existent admin login should fail without leaking sensitive info",
    async () => {
      await api.functional.auth.admin.login(unauthConn, { body: credentials });
    },
  );
}
