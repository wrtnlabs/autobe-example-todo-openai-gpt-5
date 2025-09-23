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
import type { ITodoAppUserRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserRateCounter";

/**
 * Validate that a user rate counter queried under a mismatched policy is not
 * found and does not leak cross-policy existence.
 *
 * Business context: System administrators can inspect rate limit policies and
 * related counters, but counters must be strictly scoped to their parent
 * policy. Querying a counter via a different policy (or a
 * non-existent/mismatched ID) must not reveal whether it exists elsewhere. The
 * endpoint should simply fail (not-found semantics).
 *
 * Steps:
 *
 * 1. Join as system admin to obtain authorized session
 * 2. Create a rate limit policy (policyA)
 * 3. Use a fresh UUID as userRateCounterId which should not belong to policyA
 * 4. Attempt to fetch the counter under policyA and expect an error (not-found or
 *    equivalent)
 *
 * Notes:
 *
 * - Do not validate HTTP status codes; only assert that an error is thrown
 * - Typia.assert is used for positive responses (admin join, policy create)
 */
export async function test_api_rate_limit_user_counter_mismatched_policy_not_found(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12), // >= 8 chars per policy
        // Optional context can be omitted or set explicitly; keep minimal
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(admin);

  // 2) Create policyA with explicit, readable values
  const createPolicyBody = {
    code: `rl_${RandomGenerator.alphaNumeric(12)}`,
    name: `RL ${RandomGenerator.name(2)}`,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    scope: RandomGenerator.pick(["user", "ip", "global"] as const),
    category: RandomGenerator.pick(["read", "write", "auth"] as const),
    window_seconds: 60, // >= 1
    max_requests: 10, // >= 1
    burst_size: null, // explicit null to disable burst
    sliding_window: false,
    enabled: true,
  } satisfies ITodoAppRateLimit.ICreate;

  const policyA: ITodoAppRateLimit =
    await api.functional.todoApp.systemAdmin.rateLimits.create(connection, {
      body: createPolicyBody,
    });
  typia.assert(policyA);

  // 3) Prepare a fresh UUID to represent a counter that is not under policyA
  const mismatchedUserRateCounterId = typia.random<
    string & tags.Format<"uuid">
  >();

  // 4) Expect an error when trying to fetch under policyA with a mismatched counter id
  await TestValidator.error(
    "mismatched parent/child: userRateCounter must be not-found under unrelated policy",
    async () => {
      await api.functional.todoApp.systemAdmin.rateLimits.userRateCounters.at(
        connection,
        {
          rateLimitId: policyA.id,
          userRateCounterId: mismatchedUserRateCounterId,
        },
      );
    },
  );
}
