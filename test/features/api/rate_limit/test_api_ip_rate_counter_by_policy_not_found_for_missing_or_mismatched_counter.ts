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
 * Ensure not-found behavior for IP rate counter fetch with missing/mismatched
 * counter.
 *
 * Steps:
 *
 * 1. Join as systemAdmin to obtain authorization (token handled by SDK).
 * 2. Create an IP-scoped rate limit policy.
 * 3. Call GET for an IP rate counter using a random valid UUID that should not
 *    exist under the created policy, and assert that an error occurs (not-found
 *    style).
 *
 * Validations:
 *
 * - Typia.assert on join and create responses
 * - Policy.scope should be "ip"
 * - TestValidator.error on the GET call (no status code assertions)
 */
export async function test_api_ip_rate_counter_by_policy_not_found_for_missing_or_mismatched_counter(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: adminJoinBody,
    });
  typia.assert(admin);

  // 2) Create a rate limit policy with IP scope
  const categoryChoices = ["read", "write", "auth"] as const;
  const policyCreateBody = {
    code: `ip_limit_${RandomGenerator.alphaNumeric(8)}`,
    name: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.paragraph({ sentences: 6 }),
    scope: "ip" as const,
    category: RandomGenerator.pick(categoryChoices),
    window_seconds: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<1>
    >(),
    max_requests: typia.random<number & tags.Type<"int32"> & tags.Minimum<1>>(),
    burst_size: null,
    sliding_window: RandomGenerator.pick([true, false] as const),
    enabled: true,
  } satisfies ITodoAppRateLimit.ICreate;
  const rateLimit: ITodoAppRateLimit =
    await api.functional.todoApp.systemAdmin.rateLimits.create(connection, {
      body: policyCreateBody,
    });
  typia.assert(rateLimit);
  TestValidator.equals("policy scope is ip", rateLimit.scope, "ip");

  // 3) Attempt to fetch a non-existent or mismatched IP rate counter
  const ipRateCounterId = typia.random<string & tags.Format<"uuid">>();
  await TestValidator.error(
    "fetching unknown ipRateCounter under policy should be not-found",
    async () => {
      await api.functional.todoApp.systemAdmin.rateLimits.ipRateCounters.at(
        connection,
        {
          rateLimitId: rateLimit.id,
          ipRateCounterId,
        },
      );
    },
  );
}
