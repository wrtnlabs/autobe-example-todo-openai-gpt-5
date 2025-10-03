import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";

/**
 * Verify 404 when fetching a non-existent user profile with a well-formed UUID.
 *
 * Business context:
 *
 * - The endpoint GET /todoMvp/user/users/{userId} returns a user's public profile
 *   (sans sensitive fields) and requires authentication. A caller should be
 *   able to read only their own profile in standard user context. When
 *   requesting a well-formed but non-existent userId, the server must respond
 *   with 404 without leaking ownership or existence hints beyond the status.
 *
 * Steps:
 *
 * 1. Authenticate by creating a member via POST /auth/user/join. (SDK auto-sets
 *    Authorization header.) Use ITodoMvpUser.ICreate for request body and
 *    expect ITodoMvpUser.IAuthorized response.
 * 2. Baseline success: Fetch the authenticated user's own profile using GET
 *    /todoMvp/user/users/{userId} with their id. Assert types and id equality.
 * 3. Negative case: Generate a different, well-formed UUID and request the
 *    profile. Expect 404 using TestValidator.httpError (no message/status
 *    manual inspection beyond this helper).
 */
export async function test_api_user_profile_not_found(
  connection: api.IConnection,
) {
  // 1) Authenticate (join) to obtain a valid session token
  const authorized = await api.functional.auth.user.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: typia.random<string & tags.MinLength<8>>(),
    } satisfies ITodoMvpUser.ICreate,
  });
  typia.assert(authorized);

  // 2) Baseline success: fetch self profile
  const self = await api.functional.todoMvp.user.users.at(connection, {
    userId: authorized.id,
  });
  typia.assert(self);
  TestValidator.equals(
    "self profile id should equal authenticated subject id",
    self.id,
    authorized.id,
  );

  // 3) Negative: request a well-formed but non-existent UUID
  let otherId = typia.random<string & tags.Format<"uuid">>();
  // Ensure it differs from current authenticated user's id (extremely unlikely collision)
  while (otherId === authorized.id)
    otherId = typia.random<string & tags.Format<"uuid">>();

  await TestValidator.httpError(
    "requesting another user's non-existent profile should return 404",
    404,
    async () => {
      await api.functional.todoMvp.user.users.at(connection, {
        userId: otherId,
      });
    },
  );
}
