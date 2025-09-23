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
 * Create and verify a rate limit policy (happy path).
 *
 * This test ensures that a system administrator can:
 *
 * 1. Register and authenticate
 * 2. Create a new rate limit policy with valid configuration
 * 3. Retrieve the created policy by its id
 *
 * Business validations:
 *
 * - The created entity returns an id (UUID) and all given fields are echoed
 * - GET by id returns identical values
 * - Timestamps follow temporal logic at creation time (created_at <= updated_at)
 */
export async function test_api_rate_limit_creation_success(
  connection: api.IConnection,
) {
  // 1) Admin registration and authentication
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // 8~64 characters policy
    user_agent: `e2e/${RandomGenerator.alphaNumeric(8)}`,
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: joinBody,
  });
  typia.assert(admin);

  // 2) Create a rate limit policy with valid configuration
  const code = `e2e_${RandomGenerator.alphaNumeric(12)}`;
  const scope = RandomGenerator.pick(["user", "ip", "global"] as const);
  const category = RandomGenerator.pick(["read", "write", "auth"] as const);
  const description = RandomGenerator.paragraph({ sentences: 6 });
  const windowSeconds = typia.random<
    number & tags.Type<"int32"> & tags.Minimum<1>
  >();
  const maxRequests = typia.random<
    number & tags.Type<"int32"> & tags.Minimum<1>
  >();
  const burstSize = typia.random<
    number & tags.Type<"int32"> & tags.Minimum<1>
  >();
  const sliding = RandomGenerator.pick([true, false] as const);
  const enabled = true; // enforce upon creation

  const createBody = {
    code,
    name: `E2E ${RandomGenerator.paragraph({ sentences: 2 })}`,
    description,
    scope,
    category,
    window_seconds: windowSeconds,
    max_requests: maxRequests,
    burst_size: burstSize,
    sliding_window: sliding,
    enabled,
  } satisfies ITodoAppRateLimit.ICreate;

  const created = await api.functional.todoApp.systemAdmin.rateLimits.create(
    connection,
    { body: createBody },
  );
  typia.assert(created);

  // Basic identity checks
  TestValidator.predicate(
    "created timestamps follow temporal logic",
    Date.parse(created.created_at) <= Date.parse(created.updated_at),
  );

  // 3) Retrieve by id and validate persistence/echo
  const fetched = await api.functional.todoApp.systemAdmin.rateLimits.at(
    connection,
    { rateLimitId: created.id },
  );
  typia.assert(fetched);

  // Identity and equality validations between created and fetched
  TestValidator.equals("fetched id equals created id", fetched.id, created.id);
  TestValidator.equals("code preserved", fetched.code, createBody.code);
  TestValidator.equals("name preserved", fetched.name, createBody.name);
  TestValidator.equals(
    "description preserved",
    fetched.description,
    createBody.description ?? null,
  );
  TestValidator.equals("scope preserved", fetched.scope, createBody.scope);
  TestValidator.equals(
    "category preserved",
    fetched.category,
    createBody.category,
  );
  TestValidator.equals(
    "window_seconds preserved",
    fetched.window_seconds,
    createBody.window_seconds,
  );
  TestValidator.equals(
    "max_requests preserved",
    fetched.max_requests,
    createBody.max_requests,
  );
  TestValidator.equals(
    "burst_size preserved",
    fetched.burst_size ?? null,
    createBody.burst_size ?? null,
  );
  TestValidator.equals(
    "sliding_window preserved",
    fetched.sliding_window,
    createBody.sliding_window,
  );
  TestValidator.equals(
    "enabled preserved",
    fetched.enabled,
    createBody.enabled,
  );

  // Timestamp validations on fetched entity
  TestValidator.predicate(
    "fetched timestamps follow temporal logic",
    Date.parse(fetched.created_at) <= Date.parse(fetched.updated_at),
  );
  TestValidator.equals(
    "created_at echoed",
    fetched.created_at,
    created.created_at,
  );
  TestValidator.equals(
    "updated_at echoed",
    fetched.updated_at,
    created.updated_at,
  );
}
