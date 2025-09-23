import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ERateLimitCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ERateLimitCategory";
import type { ERateLimitScope } from "@ORGANIZATION/PROJECT-api/lib/structures/ERateLimitScope";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppRateLimit } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppRateLimit";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

export async function test_api_rate_limit_deletion_blocked_when_enabled(
  connection: api.IConnection,
) {
  /**
   * Validate that attempting to retire (DELETE) an enabled rate limit policy is
   * blocked.
   *
   * Steps:
   *
   * 1. Authenticate as a system administrator (join).
   * 2. Create a rate limit policy with enabled=true.
   * 3. Attempt to DELETE the policy while enabled -> expect error.
   * 4. Confirm the policy still exists and remains enabled=true.
   * 5. Disable the policy (enabled=false) and verify the update.
   * 6. DELETE again (should succeed), then confirm GET fails (not retrievable).
   */
  // 1) Authenticate as system administrator
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(admin);

  // 2) Create an enabled rate limit policy
  const policy: ITodoAppRateLimit =
    await api.functional.todoApp.systemAdmin.rateLimits.create(connection, {
      body: {
        code: `rl_${RandomGenerator.alphaNumeric(12)}`,
        name: RandomGenerator.paragraph({ sentences: 3 }),
        description: RandomGenerator.paragraph({ sentences: 8 }),
        scope: RandomGenerator.pick(["user", "ip", "global"] as const),
        category: RandomGenerator.pick(["read", "write", "auth"] as const),
        window_seconds: typia.random<
          number & tags.Type<"int32"> & tags.Minimum<1>
        >(),
        max_requests: typia.random<
          number & tags.Type<"int32"> & tags.Minimum<1>
        >(),
        burst_size: null,
        sliding_window: Math.random() < 0.5,
        enabled: true,
      } satisfies ITodoAppRateLimit.ICreate,
    });
  typia.assert(policy);

  // 3) Try to delete while enabled -> expect failure
  await TestValidator.error(
    "deletion is blocked while policy is enabled",
    async () => {
      await api.functional.todoApp.systemAdmin.rateLimits.erase(connection, {
        rateLimitId: policy.id,
      });
    },
  );

  // 4) Confirm policy remains and is still enabled
  const persisted: ITodoAppRateLimit =
    await api.functional.todoApp.systemAdmin.rateLimits.at(connection, {
      rateLimitId: policy.id,
    });
  typia.assert(persisted);
  TestValidator.equals(
    "policy id unchanged after failed deletion",
    persisted.id,
    policy.id,
  );
  TestValidator.equals(
    "policy remains enabled after failed deletion",
    persisted.enabled,
    true,
  );

  // 5) Disable the policy for cleanup
  const disabled: ITodoAppRateLimit =
    await api.functional.todoApp.systemAdmin.rateLimits.update(connection, {
      rateLimitId: policy.id,
      body: { enabled: false } satisfies ITodoAppRateLimit.IUpdate,
    });
  typia.assert(disabled);
  TestValidator.equals(
    "policy disabled flag is false",
    disabled.enabled,
    false,
  );

  // 6) Now deletion should succeed; afterward, GET should fail
  await api.functional.todoApp.systemAdmin.rateLimits.erase(connection, {
    rateLimitId: policy.id,
  });

  await TestValidator.error(
    "deleted policy should not be retrievable",
    async () => {
      await api.functional.todoApp.systemAdmin.rateLimits.at(connection, {
        rateLimitId: policy.id,
      });
    },
  );
}
