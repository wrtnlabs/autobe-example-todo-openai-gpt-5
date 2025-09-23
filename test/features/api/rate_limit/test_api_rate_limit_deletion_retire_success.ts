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

/**
 * Retire a rate limit policy after disabling it and verify it becomes
 * non-retrievable.
 *
 * Business flow:
 *
 * 1. Admin joins (auth token handled by SDK).
 * 2. Create a rate limit policy with enabled=true.
 * 3. Disable the policy (enabled=false) to satisfy deletion precondition.
 * 4. Retire (DELETE) the policy.
 * 5. Confirm GET on the retired policy fails (logical deletion effective).
 */
export async function test_api_rate_limit_deletion_retire_success(
  connection: api.IConnection,
) {
  // 1) Authenticate as system administrator
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 2) Create a new rate limit policy (enabled=true initially)
  const scopeOptions = ["user", "ip", "global"] as const;
  const categoryOptions = ["read", "write", "auth"] as const;
  const scope: ERateLimitScope = RandomGenerator.pick(scopeOptions);
  const category: ERateLimitCategory = RandomGenerator.pick(categoryOptions);

  const createBody = {
    code: `rl_${RandomGenerator.alphaNumeric(8)}`,
    name: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.paragraph({ sentences: 8 }),
    scope,
    category,
    window_seconds: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<1>
    >(),
    max_requests: typia.random<number & tags.Type<"int32"> & tags.Minimum<1>>(),
    burst_size: null,
    sliding_window: RandomGenerator.pick([true, false] as const),
    enabled: true,
  } satisfies ITodoAppRateLimit.ICreate;

  const created = await api.functional.todoApp.systemAdmin.rateLimits.create(
    connection,
    { body: createBody },
  );
  typia.assert(created);
  TestValidator.equals(
    "created policy code matches request",
    created.code,
    createBody.code,
  );
  TestValidator.equals(
    "created policy is enabled initially",
    created.enabled,
    true,
  );

  // 3) Disable the policy to satisfy precondition for retirement
  const updated = await api.functional.todoApp.systemAdmin.rateLimits.update(
    connection,
    {
      rateLimitId: created.id,
      body: { enabled: false } satisfies ITodoAppRateLimit.IUpdate,
    },
  );
  typia.assert(updated);
  TestValidator.equals("updated policy id unchanged", updated.id, created.id);
  TestValidator.equals(
    "policy disabled before deletion",
    updated.enabled,
    false,
  );

  // 4) Retire (DELETE) the policy
  await api.functional.todoApp.systemAdmin.rateLimits.erase(connection, {
    rateLimitId: created.id,
  });

  // 5) Verify it can no longer be retrieved (must error)
  await TestValidator.error(
    "retrieving retired policy should fail",
    async () => {
      await api.functional.todoApp.systemAdmin.rateLimits.at(connection, {
        rateLimitId: created.id,
      });
    },
  );
}
