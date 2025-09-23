import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppUserProfile } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserProfile";

/**
 * Deny cross-user profile creation and allow self-owned creation.
 *
 * Purpose:
 *
 * - Ensure that an authenticated todoUser cannot create a profile for another
 *   user's id via POST /todoApp/todoUser/users/{userId}/profile.
 * - Confirm that creating a profile for self (owner) works as expected.
 *
 * Workflow:
 *
 * 1. Register User A on the primary connection (token A is attached by SDK).
 * 2. Register User B on a separate, clean connection clone (headers: {}), so
 *    primary connection remains authenticated as A.
 * 3. While authenticated as A, attempt to create a profile using B's userId ->
 *    expect error.
 * 4. Using B's connection, create B's own profile -> success; verify ownership
 *    binding.
 */
export async function test_api_profile_create_cross_user_access_denied(
  connection: api.IConnection,
) {
  // 1) Register User A (primary connection retains A's token)
  const joinABody = typia.random<ITodoAppTodoUser.ICreate>();
  const authorizedA: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: joinABody,
    });
  typia.assert(authorizedA);

  // 2) Register User B on a separate, clean connection to avoid overwriting A's token
  const bConnection: api.IConnection = { ...connection, headers: {} };
  const joinBBody = typia.random<ITodoAppTodoUser.ICreate>();
  const authorizedB: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(bConnection, {
      body: joinBBody,
    });
  typia.assert(authorizedB);

  // Sanity: two different users must have different IDs
  TestValidator.notEquals(
    "distinct users should have different ids",
    authorizedA.id,
    authorizedB.id,
  );

  // 3) While authenticated as A, attempt to create a profile for B -> must be denied
  const crossCreateBody = typia.random<ITodoAppUserProfile.ICreate>();
  await TestValidator.error(
    "authenticated as A must not create profile for B",
    async () => {
      await api.functional.todoApp.todoUser.users.profile.create(connection, {
        userId: authorizedB.id,
        body: crossCreateBody,
      });
    },
  );

  // 4) Positive control: authenticated as B, create B's own profile -> success
  const selfCreateBody = typia.random<ITodoAppUserProfile.ICreate>();
  const profileB: ITodoAppUserProfile =
    await api.functional.todoApp.todoUser.users.profile.create(bConnection, {
      userId: authorizedB.id,
      body: selfCreateBody,
    });
  typia.assert(profileB);

  // Ownership binding must match B's id
  TestValidator.equals(
    "profile owner id must match B.id",
    profileB.todo_app_user_id,
    authorizedB.id,
  );
}
