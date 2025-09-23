import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppUserPreference } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserPreference";

/**
 * Update preferences should fail when no record exists (no upsert).
 *
 * Flow:
 *
 * 1. Join as todoUser and obtain authenticated context and userId.
 * 2. Try to update preferences for that user without any prior creation.
 * 3. Ensure the update call throws an error (record not found or equivalent).
 * 4. Repeat the update attempt with another valid body to ensure no implicit
 *    creation occurred.
 */
export async function test_api_user_preferences_update_not_found_when_absent(
  connection: api.IConnection,
) {
  // 1) Authenticate (join) and capture userId
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authorized);
  const userId = authorized.id;

  // Prepare two valid update bodies
  const firstBody = {
    timezone: "Asia/Seoul",
    locale: "en-US",
    page_size: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<1> & tags.Maximum<100>
    >(),
  } satisfies ITodoAppUserPreference.IUpdate;

  const secondBody = {
    timezone: "Asia/Seoul",
    locale: "en-US",
    page_size: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<1> & tags.Maximum<100>
    >(),
  } satisfies ITodoAppUserPreference.IUpdate;

  // 2) First update attempt must fail (no existing record)
  await TestValidator.error(
    "updating preferences without existing record must fail (first attempt)",
    async () => {
      await api.functional.todoApp.todoUser.users.preferences.update(
        connection,
        {
          userId,
          body: firstBody,
        },
      );
    },
  );

  // 3) Second update attempt must also fail (no implicit upsert)
  await TestValidator.error(
    "updating preferences still fails after first error (no implicit upsert)",
    async () => {
      await api.functional.todoApp.todoUser.users.preferences.update(
        connection,
        {
          userId,
          body: secondBody,
        },
      );
    },
  );
}
