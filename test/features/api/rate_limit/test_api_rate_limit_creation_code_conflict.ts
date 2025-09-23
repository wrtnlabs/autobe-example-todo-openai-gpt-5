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
 * Duplicate rate limit code creation must fail and leave the original intact.
 *
 * This test covers the negative path where an administrator attempts to create
 * a second rate limit policy using a business code that already exists. The
 * backend must reject the operation with a business error and must not modify
 * the pre-existing policy.
 *
 * Steps:
 *
 * 1. System admin joins to obtain authorization (token managed by SDK).
 * 2. Create the first rate limit policy (Policy A) with a specific `code`.
 * 3. Attempt to create a second policy with the exact same `code` → expect error.
 * 4. Retrieve Policy A and confirm all business fields remain unchanged.
 */
export async function test_api_rate_limit_creation_code_conflict(
  connection: api.IConnection,
) {
  // 1) Authenticate as system administrator
  const adminAuth = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(adminAuth);

  // 2) Create initial rate limit policy (Policy A)
  const code: string = `rl-${RandomGenerator.alphabets(4)}-${RandomGenerator.alphaNumeric(6)}`;
  const scopeOptions = ["user", "ip", "global"] as const;
  const categoryOptions = ["read", "write", "auth"] as const;

  const createBodyA = {
    code,
    name: `Rate limit ${RandomGenerator.paragraph({ sentences: 2 })}`,
    description: RandomGenerator.paragraph({ sentences: 5 }),
    scope: RandomGenerator.pick(scopeOptions),
    category: RandomGenerator.pick(categoryOptions),
    window_seconds: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<1>
    >(),
    max_requests: typia.random<number & tags.Type<"int32"> & tags.Minimum<1>>(),
    burst_size: null,
    sliding_window: Math.random() < 0.5,
    enabled: true,
  } satisfies ITodoAppRateLimit.ICreate;

  const created: ITodoAppRateLimit =
    await api.functional.todoApp.systemAdmin.rateLimits.create(connection, {
      body: createBodyA,
    });
  typia.assert(created);

  TestValidator.equals("created policy code matches input", created.code, code);

  // 3) Attempt duplicate creation with the same code → expect business error
  const createBodyDuplicate = {
    code, // duplicate code
    name: `Another ${RandomGenerator.paragraph({ sentences: 2 })}`,
    description: RandomGenerator.paragraph({ sentences: 3 }),
    scope: RandomGenerator.pick(scopeOptions),
    category: RandomGenerator.pick(categoryOptions),
    window_seconds: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<1>
    >(),
    max_requests: typia.random<number & tags.Type<"int32"> & tags.Minimum<1>>(),
    burst_size: null,
    sliding_window: Math.random() < 0.5,
    enabled: true,
  } satisfies ITodoAppRateLimit.ICreate;

  await TestValidator.error(
    "creating a second policy with duplicate code should fail",
    async () => {
      await api.functional.todoApp.systemAdmin.rateLimits.create(connection, {
        body: createBodyDuplicate,
      });
    },
  );

  // 4) Fetch original policy and ensure it remains unchanged
  const reloaded = await api.functional.todoApp.systemAdmin.rateLimits.at(
    connection,
    { rateLimitId: created.id },
  );
  typia.assert(reloaded);

  TestValidator.equals(
    "persisted id remains the same",
    reloaded.id,
    created.id,
  );
  TestValidator.equals(
    "code remains unchanged after conflict attempt",
    reloaded.code,
    created.code,
  );

  // Compare entire objects while ignoring updated_at for robustness
  TestValidator.equals(
    "original policy remains intact (ignoring updated_at)",
    reloaded,
    created,
    (key) => key === "updated_at",
  );
}
