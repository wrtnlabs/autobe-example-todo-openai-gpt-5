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

export async function test_api_rate_limit_update_fields_success(
  connection: api.IConnection,
) {
  /**
   * Validate admin can update mutable fields of a rate limit policy while
   * preserving id/code and timestamp rules.
   *
   * Steps:
   *
   * 1. Admin join to obtain authenticated context
   * 2. Create a baseline rate limit policy
   * 3. Update mutable fields (name, description, window_seconds, max_requests,
   *    sliding_window, enabled, burst_size)
   * 4. Read back the policy to confirm persistence and timestamps
   */

  // 1) Authenticate as system admin
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert<ITodoAppSystemAdmin.IAuthorized>(admin);

  // 2) Create a baseline policy
  const createBody = {
    code: `rl_${RandomGenerator.alphaNumeric(10)}`,
    name: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.paragraph({ sentences: 6 }),
    scope: typia.random<ERateLimitScope>(),
    category: typia.random<ERateLimitCategory>(),
    window_seconds: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<1>
    >(),
    max_requests: typia.random<number & tags.Type<"int32"> & tags.Minimum<1>>(),
    burst_size: typia.random<number & tags.Type<"int32"> & tags.Minimum<1>>(),
    sliding_window: typia.random<boolean>(),
    enabled: typia.random<boolean>(),
  } satisfies ITodoAppRateLimit.ICreate;

  const orig = await api.functional.todoApp.systemAdmin.rateLimits.create(
    connection,
    { body: createBody },
  );
  typia.assert<ITodoAppRateLimit>(orig);

  // Keep original invariants
  const origId = orig.id;
  const origCode = orig.code;
  const origCreatedAt = orig.created_at;
  const origUpdatedAt = orig.updated_at;
  const origScope = orig.scope;
  const origCategory = orig.category;

  // 3) Update only mutable fields
  const newName = `${RandomGenerator.paragraph({ sentences: 2 })} updated`;
  const newDescription: string | null = null; // exercise nullable update
  const newWindowSeconds = orig.window_seconds + 1; // ensure change
  const newMaxRequests = orig.max_requests + 5; // ensure change
  const newSlidingWindow = !orig.sliding_window; // toggle
  const newEnabled = !orig.enabled; // toggle
  const newBurstSize =
    orig.burst_size === null || orig.burst_size === undefined
      ? 10
      : orig.burst_size + 1;

  const updateBody = {
    name: newName,
    description: newDescription,
    window_seconds: newWindowSeconds,
    max_requests: newMaxRequests,
    sliding_window: newSlidingWindow,
    enabled: newEnabled,
    burst_size: newBurstSize,
  } satisfies ITodoAppRateLimit.IUpdate;

  const updated = await api.functional.todoApp.systemAdmin.rateLimits.update(
    connection,
    { rateLimitId: origId, body: updateBody },
  );
  typia.assert<ITodoAppRateLimit>(updated);

  // 4) Read back and validate persistence
  const reloaded = await api.functional.todoApp.systemAdmin.rateLimits.at(
    connection,
    { rateLimitId: origId },
  );
  typia.assert<ITodoAppRateLimit>(reloaded);

  // Identity invariants
  TestValidator.equals(
    "id must stay unchanged after update",
    updated.id,
    origId,
  );
  TestValidator.equals(
    "code must stay unchanged after update",
    updated.code,
    origCode,
  );

  // Non-updated classification fields
  TestValidator.equals("scope must remain unchanged", updated.scope, origScope);
  TestValidator.equals(
    "category must remain unchanged",
    updated.category,
    origCategory,
  );

  // Updated fields should match request payload
  TestValidator.equals("name must be updated", updated.name, newName);
  TestValidator.equals(
    "description must be updated to null",
    updated.description,
    newDescription,
  );
  TestValidator.equals(
    "window_seconds must be updated",
    updated.window_seconds,
    newWindowSeconds,
  );
  TestValidator.equals(
    "max_requests must be updated",
    updated.max_requests,
    newMaxRequests,
  );
  TestValidator.equals(
    "sliding_window must be toggled",
    updated.sliding_window,
    newSlidingWindow,
  );
  TestValidator.equals("enabled must be toggled", updated.enabled, newEnabled);
  TestValidator.equals(
    "burst_size must be updated",
    updated.burst_size,
    newBurstSize,
  );

  // Timestamp rules
  TestValidator.equals(
    "created_at must remain unchanged",
    updated.created_at,
    origCreatedAt,
  );
  await TestValidator.predicate(
    "updated_at must be strictly greater than original",
    async () =>
      new Date(updated.updated_at).getTime() >
      new Date(origUpdatedAt).getTime(),
  );

  // Reloaded should reflect the same state as updated for verified fields
  TestValidator.equals("reloaded id matches", reloaded.id, updated.id);
  TestValidator.equals("reloaded code matches", reloaded.code, updated.code);
  TestValidator.equals("reloaded name matches", reloaded.name, updated.name);
  TestValidator.equals(
    "reloaded description matches",
    reloaded.description,
    updated.description,
  );
  TestValidator.equals("reloaded scope matches", reloaded.scope, updated.scope);
  TestValidator.equals(
    "reloaded category matches",
    reloaded.category,
    updated.category,
  );
  TestValidator.equals(
    "reloaded window_seconds matches",
    reloaded.window_seconds,
    updated.window_seconds,
  );
  TestValidator.equals(
    "reloaded max_requests matches",
    reloaded.max_requests,
    updated.max_requests,
  );
  TestValidator.equals(
    "reloaded burst_size matches",
    reloaded.burst_size,
    updated.burst_size,
  );
  TestValidator.equals(
    "reloaded sliding_window matches",
    reloaded.sliding_window,
    updated.sliding_window,
  );
  TestValidator.equals(
    "reloaded enabled matches",
    reloaded.enabled,
    updated.enabled,
  );
  TestValidator.equals(
    "reloaded created_at matches original",
    reloaded.created_at,
    origCreatedAt,
  );
  TestValidator.equals(
    "reloaded updated_at matches updated",
    reloaded.updated_at,
    updated.updated_at,
  );
}
