import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Register a new todoUser and verify tokens; then ensure duplicate email is
 * rejected.
 *
 * Business goals:
 *
 * - Happy path: POST /auth/todoUser/join issues IAuthorized with access/refresh
 *   tokens
 * - Error path: Duplicate email is rejected by uniqueness policy
 *
 * Steps:
 *
 * 1. Generate unique email and valid password (8–64 chars)
 * 2. Call join → expect IAuthorized; validate token strings and temporal relations
 * 3. Attempt duplicate join with same email → expect error
 */
export async function test_api_todo_user_registration_success_with_role_grant_and_tokens(
  connection: api.IConnection,
) {
  // 1) Prepare unique credentials matching DTO policy
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12); // 8–64 chars policy satisfied

  const joinBody = {
    email,
    password,
  } satisfies ITodoAppTodoUser.ICreate;

  // 2) Register
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized); // ITodoAppTodoUser.IAuthorized

  // Validate token semantics (business logic checks)
  TestValidator.predicate(
    "access token must be non-empty string",
    authorized.token.access.length > 0,
  );
  TestValidator.predicate(
    "refresh token must be non-empty string",
    authorized.token.refresh.length > 0,
  );
  TestValidator.notEquals(
    "access and refresh token should differ",
    authorized.token.access,
    authorized.token.refresh,
  );

  const now = Date.now();
  const accessExp = new Date(authorized.token.expired_at).getTime();
  const refreshUntil = new Date(authorized.token.refreshable_until).getTime();

  TestValidator.predicate(
    "access token expiration must be in the future",
    accessExp > now,
  );
  TestValidator.predicate(
    "refresh window must not precede access expiration",
    refreshUntil >= accessExp,
  );

  // 3) Duplicate email must fail
  const duplicateBody = {
    email,
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;

  await TestValidator.error(
    "duplicate email registration should fail",
    async () => {
      await api.functional.auth.todoUser.join(connection, {
        body: duplicateBody,
      });
    },
  );
}
