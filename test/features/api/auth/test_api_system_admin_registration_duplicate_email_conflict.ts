import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Validate duplicate email conflict on system admin registration.
 *
 * Business goal:
 *
 * - Ensure that POST /auth/systemAdmin/join enforces the unique email rule.
 *
 * Test flow:
 *
 * 1. Happy path: register a system admin with a random unique email (succeeds).
 * 2. Conflict path: attempt to register again with the same email (fails).
 *
 * Implementation notes:
 *
 * - Use ITodoAppSystemAdminJoin.ICreate for request bodies and typia.assert on
 *   the authorized response.
 * - Do not test HTTP status codes; only verify that an error is thrown on the
 *   duplicate attempt using TestValidator.error.
 * - After the first successful join, create a fresh connection with empty headers
 *   to avoid token side effects for the second join attempt.
 */
export async function test_api_system_admin_registration_duplicate_email_conflict(
  connection: api.IConnection,
) {
  // 1) First registration should succeed
  const email = typia.random<string & tags.Format<"email">>();
  const password1 = RandomGenerator.alphabets(12); // >= 8 chars to satisfy policy

  const firstJoinBody = {
    email,
    password: password1,
    ip: "127.0.0.1",
    user_agent: `e2e/${RandomGenerator.alphabets(6)}`,
  } satisfies ITodoAppSystemAdminJoin.ICreate;

  const firstAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: firstJoinBody,
    });
  typia.assert(firstAuth);

  // 2) Second registration with the same email must fail (duplicate email)
  const freshConn: api.IConnection = { ...connection, headers: {} };
  const password2 = RandomGenerator.alphabets(10);
  const secondJoinBody = {
    email, // same email to trigger uniqueness violation
    password: password2,
  } satisfies ITodoAppSystemAdminJoin.ICreate;

  await TestValidator.error(
    "duplicate email registration should be rejected",
    async () => {
      await api.functional.auth.systemAdmin.join(freshConn, {
        body: secondJoinBody,
      });
    },
  );
}
