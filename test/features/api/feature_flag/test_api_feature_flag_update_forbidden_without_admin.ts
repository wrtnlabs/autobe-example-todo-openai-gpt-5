import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppFeatureFlag } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppFeatureFlag";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Ensure a non-admin (todoUser) cannot update a system feature flag.
 *
 * Steps:
 *
 * 1. Register as a todoUser via /auth/todoUser/join (token is handled by SDK)
 * 2. Attempt to update a feature flag via PUT
 *    /todoApp/systemAdmin/featureFlags/{featureFlagId}
 * 3. Expect the operation to fail with an authorization error (no status code
 *    assertion)
 */
export async function test_api_feature_flag_update_forbidden_without_admin(
  connection: api.IConnection,
) {
  // 1) Register as non-admin todoUser
  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(authorized);

  // Prepare a valid update payload (all optional fields in IUpdate)
  const startAt = new Date().toISOString();
  const endAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +1 hour
  const updateBody = {
    name: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.paragraph({ sentences: 8 }),
    active: true,
    environment: RandomGenerator.pick(["prod", "staging", "dev"] as const),
    rollout_percentage: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
    >(),
    start_at: startAt,
    end_at: endAt,
  } satisfies ITodoAppFeatureFlag.IUpdate;

  // 2) Attempt forbidden update as non-admin and 3) validate error
  await TestValidator.error(
    "non-admin cannot update feature flag",
    async () => {
      await api.functional.todoApp.systemAdmin.featureFlags.update(connection, {
        featureFlagId: typia.random<string & tags.Format<"uuid">>(),
        body: updateBody,
      });
    },
  );
}
