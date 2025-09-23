import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Duplicate email registration must be rejected.
 *
 * Business context: The system must enforce unique emails for todo users. When
 * a client tries to register using an email that is already taken, the backend
 * must reject the request. This protects account integrity and prevents
 * duplicated identities.
 *
 * Steps:
 *
 * 1. Register a new todo user with a unique email (expect success).
 * 2. Attempt to register again with the SAME email but a different valid password
 *    (expect an error due to email uniqueness constraint).
 *
 * Validation:
 *
 * - First join returns ITodoAppTodoUser.IAuthorized and passes typia.assert.
 * - Second join throws an error; we assert the error occurrence only (no status
 *   checks).
 */
export async function test_api_todo_user_registration_duplicate_email_conflict(
  connection: api.IConnection,
) {
  // 1) Prepare unique credentials
  const email = typia.random<string & tags.Format<"email">>();
  const password1 = RandomGenerator.alphaNumeric(12); // 8-64 chars policy satisfied

  // 2) First registration should succeed
  const firstBody = {
    email,
    password: password1,
  } satisfies ITodoAppTodoUser.ICreate;
  const firstAuth = await api.functional.auth.todoUser.join(connection, {
    body: firstBody,
  });
  typia.assert(firstAuth); // ITodoAppTodoUser.IAuthorized

  // 3) Second registration with the same email should fail
  const secondBody = {
    email,
    password: RandomGenerator.alphaNumeric(14),
  } satisfies ITodoAppTodoUser.ICreate;

  await TestValidator.error(
    "duplicate email must be rejected on second join",
    async () => {
      await api.functional.auth.todoUser.join(connection, { body: secondBody });
    },
  );
}
