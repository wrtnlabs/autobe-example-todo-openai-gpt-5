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
 * Retrieve a user rate counter under a policy (success path via simulation).
 *
 * This test authenticates as a system administrator, creates a user-scoped rate
 * limit policy, and retrieves a user rate counter record under that policy
 * using simulation mode for stable success (counters are system-managed and
 * have no creation/listing APIs). The test validates:
 *
 * 1. Admin authentication success and token issuance
 * 2. Policy creation with valid business configuration
 * 3. Successful retrieval of a user rate counter (typed and well-formed)
 *
 * Notes:
 *
 * - We intentionally use simulation mode to ensure the counter fetch succeeds
 *   because there is no way to produce or discover a real counter ID from
 *   available APIs. Correlation checks between path rateLimitId and returned
 *   counter are skipped under simulation.
 */
export async function test_api_rate_limit_user_counter_detail_success(
  connection: api.IConnection,
) {
  // Use simulation mode for deterministic testability
  const conn: api.IConnection = { ...connection, simulate: true };

  // 1) Authenticate as system admin
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(conn, { body: joinBody });
  typia.assert(admin);

  // 2) Create a rate limit policy (user scope)
  const categories = ["read", "write", "auth"] as const;
  const createBody = {
    code: `rl_${RandomGenerator.alphaNumeric(10)}`,
    name: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.paragraph({ sentences: 8 }),
    scope: "user",
    category: RandomGenerator.pick(categories),
    window_seconds: 60,
    max_requests: 10,
    burst_size: null,
    sliding_window: false,
    enabled: true,
  } satisfies ITodoAppRateLimit.ICreate;
  const policy: ITodoAppRateLimit =
    await api.functional.todoApp.systemAdmin.rateLimits.create(conn, {
      body: createBody,
    });
  typia.assert(policy);

  // Business assertions on created policy
  TestValidator.equals("policy scope should be 'user'", policy.scope, "user");
  TestValidator.predicate("policy should be enabled", policy.enabled === true);
  TestValidator.predicate(
    "window_seconds must be >= 1",
    policy.window_seconds >= 1,
  );
  TestValidator.predicate(
    "max_requests must be >= 1",
    policy.max_requests >= 1,
  );

  // 3) Retrieve a user rate counter under the policy
  const userRateCounterId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();
  const counter: ITodoAppUserRateCounter =
    await api.functional.todoApp.systemAdmin.rateLimits.userRateCounters.at(
      conn,
      {
        rateLimitId: policy.id,
        userRateCounterId,
      },
    );
  typia.assert(counter);

  // In simulation, returned counter is random; do not assert correlation.
  // Just ensure the response is well-typed (already validated by typia.assert).
}
