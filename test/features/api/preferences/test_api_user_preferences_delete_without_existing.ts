import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppUserPreference } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserPreference";

export async function test_api_user_preferences_delete_without_existing(
  connection: api.IConnection,
) {
  // 1) Create and authenticate the owner todoUser (join)
  const ownerJoinBody = {
    ...typia.random<ITodoAppTodoUser.ICreate>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const ownerAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: ownerJoinBody,
    });
  typia.assert(ownerAuth);

  const ownerId = ownerAuth.id; // string & tags.Format<"uuid">

  // 2) Cross-user negative: other authenticated user must NOT delete owner's preferences
  //    - Use an isolated connection clone so original `connection` remains owner-authenticated
  const otherConn: api.IConnection = { ...connection, headers: {} };
  const otherJoinBody = {
    ...typia.random<ITodoAppTodoUser.ICreate>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const otherAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(otherConn, {
      body: otherJoinBody,
    });
  typia.assert(otherAuth);

  await TestValidator.error(
    "other authenticated user cannot delete owner's preferences",
    async () => {
      await api.functional.todoApp.todoUser.users.preferences.erase(otherConn, {
        userId: ownerId,
      });
    },
  );

  // 3) Idempotent deletion by the owner: call DELETE twice
  await api.functional.todoApp.todoUser.users.preferences.erase(connection, {
    userId: ownerId,
  });
  await api.functional.todoApp.todoUser.users.preferences.erase(connection, {
    userId: ownerId,
  });

  // 4) Post-condition read: GET should result in an error after deletion (no status assertion)
  await TestValidator.error(
    "reading preferences after deletion should fail (no active record)",
    async () => {
      await api.functional.todoApp.todoUser.users.preferences.at(connection, {
        userId: ownerId,
      });
    },
  );

  // 5) Unauthenticated negative: must not allow deletion
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated client cannot delete preferences",
    async () => {
      await api.functional.todoApp.todoUser.users.preferences.erase(
        unauthConn,
        {
          userId: ownerId,
        },
      );
    },
  );
}
