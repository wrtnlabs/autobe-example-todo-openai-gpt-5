import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";

/**
 * Ensure unauthenticated access to user profile is rejected.
 *
 * Business goal:
 *
 * - The user profile read endpoint requires authentication. This test verifies
 *   that requests made without any authentication headers do not succeed.
 *
 * What this test validates:
 *
 * 1. Build an unauthenticated connection (headers: {}).
 * 2. Call GET /todoMvp/user/users/{userId} with a random UUID.
 * 3. Assert that the call fails (do not assert specific HTTP status codes).
 */
export async function test_api_user_profile_unauthorized(
  connection: api.IConnection,
) {
  // 1) Prepare an unauthenticated connection (do not manipulate after creation)
  const anonymous: api.IConnection = { ...connection, headers: {} };

  // 2) Valid UUID for path parameter
  const userId = typia.random<string & tags.Format<"uuid">>();

  // 3) Attempt to access profile without auth and expect an error
  await TestValidator.error(
    "unauthenticated access to user profile should be rejected",
    async () => {
      await api.functional.todoMvp.user.users.at(anonymous, { userId });
    },
  );
}
