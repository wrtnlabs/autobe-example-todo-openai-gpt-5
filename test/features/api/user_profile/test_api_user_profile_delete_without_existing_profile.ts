import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppUserProfile } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserProfile";

export async function test_api_user_profile_delete_without_existing_profile(
  connection: api.IConnection,
) {
  // 1) Owner registers (join) and becomes authenticated on this connection
  const owner = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(owner);

  // 2) Delete non-existent profile (idempotent expectation)
  await api.functional.todoApp.todoUser.users.profile.erase(connection, {
    userId: owner.id,
  });

  // 3) Call delete again to verify idempotency (should still succeed without error)
  await api.functional.todoApp.todoUser.users.profile.erase(connection, {
    userId: owner.id,
  });

  // 4) GET after delete should fail (no active profile must exist)
  await TestValidator.error(
    "fetching profile after deletion should fail (not found)",
    async () => {
      await api.functional.todoApp.todoUser.users.profile.at(connection, {
        userId: owner.id,
      });
    },
  );

  // 5) Create another user (intruder) and attempt cross-user deletion
  const intruder = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(intruder);
  TestValidator.notEquals("distinct users are created", intruder.id, owner.id);

  // Now the connection holds intruder's token; try deleting owner's profile → must be denied
  await TestValidator.error(
    "other user cannot delete owner's profile",
    async () => {
      await api.functional.todoApp.todoUser.users.profile.erase(connection, {
        userId: owner.id,
      });
    },
  );

  // 6) Unauthenticated attempt must be denied
  const unauth: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated client cannot delete profile",
    async () => {
      await api.functional.todoApp.todoUser.users.profile.erase(unauth, {
        userId: owner.id,
      });
    },
  );
}
