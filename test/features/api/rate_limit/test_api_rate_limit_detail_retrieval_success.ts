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

export async function test_api_rate_limit_detail_retrieval_success(
  connection: api.IConnection,
) {
  /**
   * Validate admin can retrieve a single rate limit policy by ID with all
   * configured fields.
   *
   * Steps:
   *
   * 1. Authenticate as systemAdmin
   * 2. Create a new rate limit policy
   * 3. Retrieve it by ID
   * 4. Validate id and field equality (excluding timestamps) and timestamp
   *    consistency
   */

  // 1) Authenticate as systemAdmin via join
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // 8~64 chars ensured by length
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, { body: joinBody });
  typia.assert(admin);

  // 2) Create a new rate limit policy
  const scopes = ["user", "ip", "global"] as const;
  const categories = ["read", "write", "auth"] as const;
  const maybeBurst =
    RandomGenerator.pick([true, false] as const) === true
      ? typia.random<number & tags.Type<"int32"> & tags.Minimum<1>>()
      : null;

  const createBody = {
    code: `rl_${RandomGenerator.alphaNumeric(12)}`,
    name: RandomGenerator.paragraph({ sentences: 2 }),
    description: RandomGenerator.paragraph({ sentences: 6 }),
    scope: RandomGenerator.pick(scopes),
    category: RandomGenerator.pick(categories),
    window_seconds: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<1>
    >(),
    max_requests: typia.random<number & tags.Type<"int32"> & tags.Minimum<1>>(),
    burst_size: maybeBurst, // explicit null or valid int32
    sliding_window: RandomGenerator.pick([true, false] as const),
    enabled: RandomGenerator.pick([true, false] as const),
  } satisfies ITodoAppRateLimit.ICreate;

  const created: ITodoAppRateLimit =
    await api.functional.todoApp.systemAdmin.rateLimits.create(connection, {
      body: createBody,
    });
  typia.assert(created);

  // 3) GET /todoApp/systemAdmin/rateLimits/{rateLimitId}
  const fetched: ITodoAppRateLimit =
    await api.functional.todoApp.systemAdmin.rateLimits.at(connection, {
      rateLimitId: created.id,
    });
  typia.assert(fetched);

  // 4) Validations
  TestValidator.equals(
    "returned id matches created id",
    fetched.id,
    created.id,
  );

  // Deep equality excluding timestamp fields
  TestValidator.equals(
    "retrieved policy equals created except timestamps",
    fetched,
    created,
    (key) => key === "created_at" || key === "updated_at",
  );

  // Timestamp consistency checks (business logic)
  const createdAtCreated = new Date(created.created_at).getTime();
  const updatedAtCreated = new Date(created.updated_at).getTime();
  const createdAtFetched = new Date(fetched.created_at).getTime();
  const updatedAtFetched = new Date(fetched.updated_at).getTime();

  TestValidator.predicate(
    "created_at should be <= updated_at (created)",
    createdAtCreated <= updatedAtCreated,
  );
  TestValidator.equals(
    "created_at is consistent between create and fetch",
    fetched.created_at,
    created.created_at,
  );
  TestValidator.equals(
    "updated_at is consistent between create and fetch",
    fetched.updated_at,
    created.updated_at,
  );
}
