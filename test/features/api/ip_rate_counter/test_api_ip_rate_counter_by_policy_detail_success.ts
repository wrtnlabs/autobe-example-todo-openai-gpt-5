import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ERateLimitCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ERateLimitCategory";
import type { ERateLimitScope } from "@ORGANIZATION/PROJECT-api/lib/structures/ERateLimitScope";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppIpRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppIpRateCounter";
import type { ITodoAppRateLimit } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppRateLimit";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Retrieve IP rate counter detail by policy (admin) - success path.
 *
 * Business flow:
 *
 * 1. Join as a systemAdmin (authorization acquired by SDK automatically).
 * 2. Create a rate limit policy (scope: "ip").
 * 3. GET an IP rate counter detail under that policy.
 *
 *    - In simulator mode, random IDs are acceptable to exercise the contract.
 *    - In live runs, the environment must provide a pre-seeded counter ID.
 * 4. Re-fetch using identifiers from the first response to validate scoping flow.
 *
 * Validation:
 *
 * - Use typia.assert() for perfect type validation on all non-void responses.
 * - Avoid HTTP status code and type-error testing as forbidden by policy.
 */
export async function test_api_ip_rate_counter_by_policy_detail_success(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: typia.random<ITodoAppSystemAdminJoin.ICreate>(),
    });
  typia.assert(admin);

  // 2) Create a rate limit policy (scope: "ip")
  const createPolicyBody = {
    code: `ip_${RandomGenerator.alphaNumeric(12)}`,
    name: RandomGenerator.paragraph({ sentences: 3 }),
    description: null,
    scope: "ip",
    category: "auth",
    window_seconds: 60,
    max_requests: 100,
    burst_size: null,
    sliding_window: false,
    enabled: true,
  } satisfies ITodoAppRateLimit.ICreate;

  const policy: ITodoAppRateLimit =
    await api.functional.todoApp.systemAdmin.rateLimits.create(connection, {
      body: createPolicyBody,
    });
  typia.assert(policy);

  // 3) Retrieve a specific IP rate counter under the created policy
  const ipRateCounterId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();

  const counter: ITodoAppIpRateCounter =
    await api.functional.todoApp.systemAdmin.rateLimits.ipRateCounters.at(
      connection,
      {
        rateLimitId: policy.id,
        ipRateCounterId,
      },
    );
  typia.assert(counter);

  // 4) Re-fetch using identifiers from the first response (scoped to returned FK)
  const counterReloaded: ITodoAppIpRateCounter =
    await api.functional.todoApp.systemAdmin.rateLimits.ipRateCounters.at(
      connection,
      {
        rateLimitId: counter.todo_app_rate_limit_id,
        ipRateCounterId: counter.id,
      },
    );
  typia.assert(counterReloaded);
}
