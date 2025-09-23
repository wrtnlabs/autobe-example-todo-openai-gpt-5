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
 * Verify duplicate code update is rejected and no records are mutated.
 *
 * Steps:
 *
 * 1. Join as a system administrator.
 * 2. Create Policy A (code: "rl-auth-login").
 * 3. Create Policy B (code: "rl-read-api").
 * 4. Attempt to update Policy A's code to Policy B's code -> expect error.
 * 5. Re-fetch A and B to confirm they have not changed.
 */
export async function test_api_rate_limit_update_code_conflict(
  connection: api.IConnection,
) {
  // 1) Authenticate as system administrator
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: "P@ssw0rd!1",
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // Helpful literal sets for enums (kept for clarity of available values)
  const scopes = ["user", "ip", "global"] as const;
  const categories = ["read", "write", "auth"] as const;
  void scopes; // avoid unused warnings while keeping documentation value
  void categories;

  // 2) Create Policy A - use explicit and stable code
  const createA = {
    code: "rl-auth-login",
    name: `Auth Login ${RandomGenerator.name(1)}`,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    scope: "user",
    category: "auth",
    window_seconds: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<1>
    >(),
    max_requests: typia.random<number & tags.Type<"int32"> & tags.Minimum<1>>(),
    burst_size: typia.random<number & tags.Type<"int32"> & tags.Minimum<1>>(),
    sliding_window: true,
    enabled: true,
  } satisfies ITodoAppRateLimit.ICreate;
  const policyA1 = await api.functional.todoApp.systemAdmin.rateLimits.create(
    connection,
    { body: createA },
  );
  typia.assert(policyA1);

  // 3) Create Policy B - distinct code to set up conflict target
  const createB = {
    code: "rl-read-api",
    name: `Read API ${RandomGenerator.name(1)}`,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    scope: "ip",
    category: "read",
    window_seconds: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<1>
    >(),
    max_requests: typia.random<number & tags.Type<"int32"> & tags.Minimum<1>>(),
    burst_size: null,
    sliding_window: false,
    enabled: true,
  } satisfies ITodoAppRateLimit.ICreate;
  const policyB1 = await api.functional.todoApp.systemAdmin.rateLimits.create(
    connection,
    { body: createB },
  );
  typia.assert(policyB1);

  // 4) Attempt conflicting update: set A's code to B's code -> must error
  await TestValidator.error("duplicate code update must fail", async () => {
    await api.functional.todoApp.systemAdmin.rateLimits.update(connection, {
      rateLimitId: policyA1.id,
      body: {
        code: policyB1.code,
      } satisfies ITodoAppRateLimit.IUpdate,
    });
  });

  // 5) Re-fetch policies and validate they are unchanged
  const policyA2 = await api.functional.todoApp.systemAdmin.rateLimits.at(
    connection,
    { rateLimitId: policyA1.id },
  );
  typia.assert(policyA2);
  const policyB2 = await api.functional.todoApp.systemAdmin.rateLimits.at(
    connection,
    { rateLimitId: policyB1.id },
  );
  typia.assert(policyB2);

  // Codes remain stable
  TestValidator.equals(
    "policy A code remains unchanged",
    policyA2.code,
    policyA1.code,
  );
  TestValidator.equals(
    "policy B code remains unchanged",
    policyB2.code,
    policyB1.code,
  );

  // Entire objects remain the same except possibly timestamps
  const ignoreTimestamps = (key: string) =>
    key === "created_at" || key === "updated_at";
  TestValidator.equals(
    "policy A unchanged except timestamps",
    policyA2,
    policyA1,
    ignoreTimestamps,
  );
  TestValidator.equals(
    "policy B unchanged except timestamps",
    policyB2,
    policyB1,
    ignoreTimestamps,
  );
}
