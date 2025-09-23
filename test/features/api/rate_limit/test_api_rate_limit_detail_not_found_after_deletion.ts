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
 * Validate that a logically deleted rate limit policy is not retrievable and
 * that repeated deletion attempts remain idempotent (continue to fail).
 *
 * Steps:
 *
 * 1. Join as system administrator (authentication provisioning handled by SDK)
 * 2. Create a new rate limit policy and capture its id
 * 3. Logically delete the policy using the id
 * 4. Attempt to GET the policy by id and expect an error (not-found style)
 * 5. Attempt to DELETE the policy again and expect an error (idempotency)
 */
export async function test_api_rate_limit_detail_not_found_after_deletion(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin via join
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const authorized: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: adminJoinBody,
    });
  typia.assert(authorized);

  // 2) Create a new rate limit policy
  const createBody = {
    code: `e2e_${RandomGenerator.alphaNumeric(12)}`,
    name: RandomGenerator.paragraph({ sentences: 3 }),
    description: null,
    scope: RandomGenerator.pick(["user", "ip", "global"] as const),
    category: RandomGenerator.pick(["read", "write", "auth"] as const),
    window_seconds: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<1>
    >(),
    max_requests: typia.random<number & tags.Type<"int32"> & tags.Minimum<1>>(),
    burst_size: null,
    sliding_window: RandomGenerator.pick([true, false] as const),
    enabled: true,
  } satisfies ITodoAppRateLimit.ICreate;
  const created: ITodoAppRateLimit =
    await api.functional.todoApp.systemAdmin.rateLimits.create(connection, {
      body: createBody,
    });
  typia.assert(created);

  // 3) Logically delete the policy
  await api.functional.todoApp.systemAdmin.rateLimits.erase(connection, {
    rateLimitId: created.id,
  });

  // 4) Verify GET after deletion returns an error (not-found style)
  await TestValidator.error(
    "deleted policy should not be retrievable",
    async () => {
      await api.functional.todoApp.systemAdmin.rateLimits.at(connection, {
        rateLimitId: created.id,
      });
    },
  );

  // 5) Idempotency: repeated deletion should also error
  await TestValidator.error(
    "re-deleting already deleted policy should fail (idempotent)",
    async () => {
      await api.functional.todoApp.systemAdmin.rateLimits.erase(connection, {
        rateLimitId: created.id,
      });
    },
  );
}
