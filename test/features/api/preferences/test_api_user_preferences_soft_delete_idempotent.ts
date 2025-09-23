import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppUserPreference } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserPreference";

/**
 * Soft-delete user preferences and validate idempotency and ownership.
 *
 * This test validates that a todoUser can logically delete (soft-delete) their
 * own preference record, that the operation is idempotent (repeated deletions
 * succeed without error), and that deleted records are no longer returned by
 * the read endpoint. It also validates permission boundaries: another user
 * cannot delete someone else’s preferences, and unauthenticated requests are
 * rejected.
 *
 * Note: The read API hides logically deleted records and does not expose
 * deleted_at; therefore, this test verifies observable behavior (read fails
 * after deletion) rather than inspecting deleted_at directly.
 *
 * Steps:
 *
 * 1. Create separate connections for two users (A and B) so each keeps its own
 *    SDK-managed Authorization header.
 * 2. User A joins (auth) and creates preferences; verify ownership link.
 * 3. User B joins (auth) and attempts to delete User A’s preferences → expect
 *    error.
 * 4. User A erases their own preferences (soft-delete) → success (void).
 * 5. Read after deletion by User A → expect error (record hidden by deleted_at).
 * 6. Call erase again (idempotency) by User A → success.
 * 7. Read still fails → expect error.
 * 8. Unauthenticated connection attempts to erase User A’s preferences → expect
 *    error.
 */
export async function test_api_user_preferences_soft_delete_idempotent(
  connection: api.IConnection,
) {
  // Prepare isolated connections per actor (do not touch headers directly)
  const connA: api.IConnection = { ...connection };
  const connB: api.IConnection = { ...connection };
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 1) User A joins (authenticate)
  const authA: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connA, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(authA);

  // 2) User A creates preferences
  const createdPrefA: ITodoAppUserPreference =
    await api.functional.todoApp.todoUser.users.preferences.create(connA, {
      userId: authA.id,
      body: {
        timezone: "Asia/Seoul",
        locale: "en-US",
        page_size: typia.random<
          number & tags.Type<"int32"> & tags.Minimum<1> & tags.Maximum<100>
        >(),
      } satisfies ITodoAppUserPreference.ICreate,
    });
  typia.assert(createdPrefA);
  TestValidator.equals(
    "created preference belongs to user A",
    createdPrefA.todo_app_user_id,
    authA.id,
  );

  // Sanity: User A can read active preferences
  const readActiveA: ITodoAppUserPreference =
    await api.functional.todoApp.todoUser.users.preferences.at(connA, {
      userId: authA.id,
    });
  typia.assert(readActiveA);
  TestValidator.equals(
    "fetched active preference belongs to user A",
    readActiveA.todo_app_user_id,
    authA.id,
  );

  // 3) User B joins (authenticate) and tries to delete A's preferences -> expect error
  const authB: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connB, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(authB);

  await TestValidator.error(
    "user B cannot delete user A's preferences (ownership enforced)",
    async () => {
      await api.functional.todoApp.todoUser.users.preferences.erase(connB, {
        userId: authA.id,
      });
    },
  );

  // 4) User A deletes own preferences (soft-delete)
  await api.functional.todoApp.todoUser.users.preferences.erase(connA, {
    userId: authA.id,
  });

  // 5) After deletion, reading must fail (record hidden by deleted_at)
  await TestValidator.error(
    "read after soft-delete should fail for owner",
    async () => {
      await api.functional.todoApp.todoUser.users.preferences.at(connA, {
        userId: authA.id,
      });
    },
  );

  // 6) Idempotency: deleting again still succeeds
  await api.functional.todoApp.todoUser.users.preferences.erase(connA, {
    userId: authA.id,
  });

  // 7) Read still fails
  await TestValidator.error(
    "read still fails after repeated soft-delete (idempotent)",
    async () => {
      await api.functional.todoApp.todoUser.users.preferences.at(connA, {
        userId: authA.id,
      });
    },
  );

  // 8) Unauthenticated attempt must fail
  await TestValidator.error(
    "unauthenticated erase attempt should fail",
    async () => {
      await api.functional.todoApp.todoUser.users.preferences.erase(
        unauthConn,
        {
          userId: authA.id,
        },
      );
    },
  );
}
