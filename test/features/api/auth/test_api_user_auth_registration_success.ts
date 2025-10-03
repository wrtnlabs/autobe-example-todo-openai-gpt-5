import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";

/**
 * Validate successful user registration and authorized session issuance.
 *
 * Flow:
 *
 * 1. Create unique credentials (email, password >= 8 chars).
 * 2. Call POST /auth/user/join with ITodoMvpUser.ICreate body.
 * 3. Assert ITodoMvpUser.IAuthorized response and business rules:
 *
 *    - Response email equals input email
 *    - Account status is active immediately after join
 *    - Token bundle exists with non-empty access/refresh strings
 *    - If optional user profile is returned, it matches top-level fields
 * 4. Negative case: duplicate registration with same email must fail.
 *
 * Notes:
 *
 * - No HTTP status code assertions (TestValidator.error only checks failure).
 * - No header manipulation (SDK manages auth internally).
 * - No type-error tests; all requests strictly match DTOs.
 */
export async function test_api_user_auth_registration_success(
  connection: api.IConnection,
) {
  // 1) Prepare unique credentials
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = `P${RandomGenerator.alphaNumeric(11)}`; // length 12 >= 8

  // 2) Register user
  const authorized = await api.functional.auth.user.join(connection, {
    body: {
      email,
      password,
    } satisfies ITodoMvpUser.ICreate,
  });

  // 3) Type assertion and business validations
  typia.assert(authorized);

  // Email equals input
  TestValidator.equals("response email equals input", authorized.email, email);

  // Account should be active after registration
  TestValidator.equals(
    "new account status is active",
    authorized.status,
    "active",
  );

  // Token presence and non-empty strings
  TestValidator.predicate(
    "access token is non-empty",
    authorized.token.access.length > 0,
  );
  TestValidator.predicate(
    "refresh token is non-empty",
    authorized.token.refresh.length > 0,
  );

  // Optional embedded user consistency check
  if (authorized.user !== undefined) {
    const user = typia.assert<ITodoMvpUser>(authorized.user);
    TestValidator.equals(
      "embedded user id matches top-level id",
      user.id,
      authorized.id,
    );
    TestValidator.equals(
      "embedded user email matches top-level email",
      user.email,
      authorized.email,
    );
    TestValidator.equals(
      "embedded user status matches top-level status",
      user.status,
      authorized.status,
    );
    TestValidator.equals(
      "embedded user created_at matches top-level created_at",
      user.created_at,
      authorized.created_at,
    );
    TestValidator.equals(
      "embedded user updated_at matches top-level updated_at",
      user.updated_at,
      authorized.updated_at,
    );
  }

  // 4) Negative case: duplicate registration should fail
  await TestValidator.error(
    "duplicate email registration should fail",
    async () => {
      await api.functional.auth.user.join(connection, {
        body: {
          email,
          password,
        } satisfies ITodoMvpUser.ICreate,
      });
    },
  );
}
