import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";

export async function test_api_user_auth_registration_duplicate_email_conflict(
  connection: api.IConnection,
) {
  /**
   * Validate unique email enforcement on registration.
   *
   * Steps:
   *
   * 1. Register a new user (POST /auth/user/join) with a unique email → expect
   *    success
   * 2. Attempt to register again with the same email → expect an error (duplicate
   *    email)
   * 3. Register with a different email → expect success and different subject id
   *
   * Notes:
   *
   * - Use typia.assert() for complete type validation on successful responses.
   * - Do not assert specific HTTP status codes; only verify that an error occurs
   *   for duplicates.
   * - Do not touch connection.headers; SDK handles auth tokens automatically.
   */
  // 0) Prepare deterministic, valid registration payload
  const email1 = typia.random<string & tags.Format<"email">>();
  const password1 = RandomGenerator.alphabets(12); // length >= 8

  const joinBody1 = {
    email: email1,
    password: password1,
  } satisfies ITodoMvpUser.ICreate;

  // 1) First registration should succeed
  const firstAuth: ITodoMvpUser.IAuthorized =
    await api.functional.auth.user.join(connection, { body: joinBody1 });
  typia.assert(firstAuth);

  // Basic business validations (not type checks)
  TestValidator.equals(
    "joined email must equal submitted email",
    firstAuth.email,
    email1,
  );
  if (firstAuth.user !== undefined) {
    TestValidator.equals(
      "optional user.email mirrors subject email",
      firstAuth.user.email,
      email1,
    );
    TestValidator.equals(
      "optional user.id equals subject id",
      firstAuth.user.id,
      firstAuth.id,
    );
  }

  // 2) Duplicate registration must fail
  await TestValidator.error(
    "duplicate email registration must be rejected",
    async () => {
      await api.functional.auth.user.join(connection, { body: joinBody1 });
    },
  );

  // 3) Registration with a different email should still succeed
  const email2 = typia.random<string & tags.Format<"email">>();
  const joinBody2 = {
    email: email2,
    password: password1,
  } satisfies ITodoMvpUser.ICreate;

  const secondAuth: ITodoMvpUser.IAuthorized =
    await api.functional.auth.user.join(connection, { body: joinBody2 });
  typia.assert(secondAuth);

  // Ensure different subject id for different account
  TestValidator.notEquals(
    "second registration yields different subject id",
    secondAuth.id,
    firstAuth.id,
  );
}
