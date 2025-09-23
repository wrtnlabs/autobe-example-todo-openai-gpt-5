import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppUserProfile } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserProfile";

export async function test_api_profile_create_conflict_when_exists(
  connection: api.IConnection,
) {
  // 1) Register a todoUser and obtain userId (token managed by SDK)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBody });
  typia.assert(authorized);

  // 2) Create initial profile
  const createProfileBody1 = {
    full_name: RandomGenerator.name(),
    nickname: RandomGenerator.name(1),
    avatar_uri: typia.random<
      string & tags.MaxLength<80000> & tags.Format<"uri">
    >(),
  } satisfies ITodoAppUserProfile.ICreate;
  const profile1: ITodoAppUserProfile =
    await api.functional.todoApp.todoUser.users.profile.create(connection, {
      userId: authorized.id,
      body: createProfileBody1,
    });
  typia.assert(profile1);

  // Validate ownership binding
  TestValidator.equals(
    "created profile belongs to authenticated user",
    profile1.todo_app_user_id,
    authorized.id,
  );

  // 3) Attempt to create again (should error with conflict)
  const createProfileBody2 = {
    full_name: RandomGenerator.name(),
    nickname: RandomGenerator.name(1),
    avatar_uri: typia.random<
      string & tags.MaxLength<80000> & tags.Format<"uri">
    >(),
  } satisfies ITodoAppUserProfile.ICreate;
  await TestValidator.error(
    "second profile creation for same user must fail",
    async () => {
      await api.functional.todoApp.todoUser.users.profile.create(connection, {
        userId: authorized.id,
        body: createProfileBody2,
      });
    },
  );
}
