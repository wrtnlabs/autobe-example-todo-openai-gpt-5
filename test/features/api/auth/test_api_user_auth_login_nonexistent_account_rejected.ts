import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";
import type { ITodoMvpUserLogin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUserLogin";

/**
 * Reject login for a non-existent member account.
 *
 * Purpose:
 *
 * - Ensure POST /auth/user/login fails when called with a well-formed email that
 *   has no registered account, without revealing account existence details.
 *
 * Test flow:
 *
 * 1. Prepare an isolated unauthenticated connection (clone with empty headers).
 * 2. Generate a valid email and password (>= 8 chars) to avoid type errors.
 * 3. Call login endpoint and assert it rejects (runtime error expected).
 *
 * Notes:
 *
 * - Do NOT check HTTP status codes or error messages.
 * - Do NOT access or mutate connection.headers beyond creating the isolated
 *   clone.
 */
export async function test_api_user_auth_login_nonexistent_account_rejected(
  connection: api.IConnection,
) {
  // 1) Isolated unauthenticated connection clone
  const anon: api.IConnection = { ...connection, headers: {} };

  // 2) Valid, well-formed credentials for a likely-nonexistent account
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12); // ≥ 8 chars

  // 3) Expect authentication to be rejected for non-existent account
  await TestValidator.error(
    "login with non-existent account must be rejected",
    async () => {
      await api.functional.auth.user.login(anon, {
        body: {
          email,
          password,
        } satisfies ITodoMvpUserLogin.IRequest,
      });
    },
  );
}
