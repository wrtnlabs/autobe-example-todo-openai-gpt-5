import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Validate password policy enforcement during todoUser registration.
 *
 * Business context:
 *
 * - Prospective members register with email and plaintext password via POST
 *   /auth/todoUser/join.
 * - Server enforces password policy (length 8–64) and issues access/refresh
 *   tokens on success.
 * - On validation failure (e.g., too-short password), no account/session
 *   artifacts should be created.
 *
 * Steps:
 *
 * 1. Attempt join with invalid short password (6 chars) and expect failure.
 * 2. Reattempt with the same email and a valid password (12 chars) and expect
 *    success.
 * 3. Attempt duplicate registration with the same email after success and expect
 *    failure.
 */
export async function test_api_todo_user_registration_password_policy_validation(
  connection: api.IConnection,
) {
  // Generate a unique email and define invalid/valid passwords
  const email = typia.random<string & tags.Format<"email">>();
  const shortPassword = RandomGenerator.alphabets(6); // violates MinLength<8>
  const strongPassword = RandomGenerator.alphaNumeric(12); // within [8,64]

  // 1) Invalid attempt: short password must fail
  await TestValidator.error(
    "join fails with short password (min length 8)",
    async () => {
      await api.functional.auth.todoUser.join(connection, {
        body: {
          email,
          password: shortPassword,
        } satisfies ITodoAppTodoUser.ICreate,
      });
    },
  );

  // 2) Valid attempt: same email should now succeed because previous failure created nothing
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: {
      email,
      password: strongPassword,
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authorized);

  // 3) Duplicate attempt after success: should be rejected due to unique email constraint
  await TestValidator.error("duplicate email should be rejected", async () => {
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email,
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppTodoUser.ICreate,
    });
  });
}
