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
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Ensure non-admin users cannot retrieve administrative rate limit details.
 *
 * Steps:
 *
 * 1. Join as system administrator and create a real rate limit policy.
 * 2. Switch identity by joining as a regular todoUser (non-admin).
 * 3. Attempt to GET the created rate limit policy using the non-admin context, and
 *    validate that the request results in an error (authorization enforced).
 */
export async function test_api_rate_limit_detail_unauthorized_non_admin(
  connection: api.IConnection,
) {
  // 1) Join as system administrator
  const adminEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const adminPassword: string = RandomGenerator.alphaNumeric(12);
  const adminAuth = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: adminEmail,
      password: adminPassword,
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(adminAuth);

  // 1-2) Create a rate limit policy to have a concrete rateLimitId
  const scopeChoices = ["user", "ip", "global"] as const; // ERateLimitScope
  const categoryChoices = ["read", "write", "auth"] as const; // ERateLimitCategory
  const createBody = {
    code: `e2e_${RandomGenerator.alphaNumeric(12)}`,
    name: `E2E Rate Limit ${RandomGenerator.name(1)}`,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    scope: RandomGenerator.pick(scopeChoices),
    category: RandomGenerator.pick(categoryChoices),
    window_seconds: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<1>
    >(),
    max_requests: typia.random<number & tags.Type<"int32"> & tags.Minimum<1>>(),
    burst_size: null,
    sliding_window: Math.random() < 0.5,
    enabled: true,
  } satisfies ITodoAppRateLimit.ICreate;
  const created = await api.functional.todoApp.systemAdmin.rateLimits.create(
    connection,
    { body: createBody },
  );
  typia.assert(created);

  // 2) Switch to non-admin user by joining as a todoUser
  const userEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const userPassword: string = RandomGenerator.alphaNumeric(12);
  const userAuth = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: userEmail,
      password: userPassword,
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(userAuth);

  // 3) Attempt to retrieve the admin-only rate limit detail as non-admin
  await TestValidator.error(
    "non-admin cannot read system admin rate limit detail",
    async () => {
      await api.functional.todoApp.systemAdmin.rateLimits.at(connection, {
        rateLimitId: created.id,
      });
    },
  );
}
