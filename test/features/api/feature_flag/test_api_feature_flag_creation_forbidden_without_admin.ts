import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppFeatureFlag } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppFeatureFlag";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_feature_flag_creation_forbidden_without_admin(
  connection: api.IConnection,
) {
  /**
   * 1. Register a regular todoUser (non-admin) and obtain authorization.
   * 2. Prepare a valid feature flag creation payload.
   * 3. Attempt creation via systemAdmin endpoint and expect an error.
   */

  // 1) Authenticate as a non-admin todoUser
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;

  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);

  // 2) Prepare a valid feature flag creation payload
  const rollout_percentage = typia.random<
    number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
  >() satisfies number as number;

  const start_at = new Date().toISOString();
  const end_at = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // +1 hour

  const createBody = {
    namespace: `ui-${RandomGenerator.alphabets(6)}`,
    environment: "dev",
    code: `flag_${RandomGenerator.alphaNumeric(8)}`,
    name: RandomGenerator.paragraph({ sentences: 2 }),
    description: RandomGenerator.paragraph({ sentences: 8 }),
    active: true,
    rollout_percentage,
    target_audience: RandomGenerator.paragraph({ sentences: 6 }),
    start_at,
    end_at,
    todo_app_service_policy_id: null,
  } satisfies ITodoAppFeatureFlag.ICreate;

  // 3) Attempt to create (should fail due to missing systemAdmin role)
  await TestValidator.error(
    "non-admin todoUser must not be able to create feature flag",
    async () => {
      await api.functional.todoApp.systemAdmin.featureFlags.create(connection, {
        body: createBody,
      });
    },
  );
}
