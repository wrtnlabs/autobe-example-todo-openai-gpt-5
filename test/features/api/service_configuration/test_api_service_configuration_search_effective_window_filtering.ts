import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { EConfigValueType } from "@ORGANIZATION/PROJECT-api/lib/structures/EConfigValueType";
import type { EServiceConfigurationOrderBy } from "@ORGANIZATION/PROJECT-api/lib/structures/EServiceConfigurationOrderBy";
import type { ESortOrder } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortOrder";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppServiceConfiguration } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppServiceConfiguration";
import type { ITodoAppServiceConfiguration } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServiceConfiguration";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Filter active configurations effective at a given instant.
 *
 * Validates that PATCH /todoApp/systemAdmin/serviceConfigurations with filters
 * { active: true, effective_at: now } returns only records whose effectivity
 * window contains the instant. Open bounds (null effective_from/effective_to)
 * are treated as unbounded sides.
 *
 * Dataset (within a unique namespace and fixed environment):
 *
 * - Included (should match):
 *
 *   1. Effective_open (active=true, no window)
 *   2. From_past_to_future (active=true, past..future)
 *   3. From_past_open (active=true, past..null)
 *   4. To_future_open (active=true, null..future)
 * - Excluded (should NOT match): 5) from_future (active=true, future start) 6)
 *   to_past (active=true, already ended) 7) inactive_current (active=false,
 *   past..future) 8) inactive_open (active=false, no window)
 *
 * Steps:
 *
 * 1. Join as system admin (token handled by SDK).
 * 2. Create records for the above cases in an isolated namespace/env.
 * 3. Search with filters: { namespace, environment, active: true, effective_at:
 *    now }.
 * 4. Validate that only the expected keys are returned; each result is active and
 *    effective at now; excluded keys are absent; and pagination basics.
 */
export async function test_api_service_configuration_search_effective_window_filtering(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const authorized: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: adminJoinBody,
    });
  typia.assert(authorized);

  // Prepare a unique dataset scope
  const namespace = `ns_${RandomGenerator.alphaNumeric(12)}`;
  const environment = "dev";
  const now = new Date();
  const hour = 60 * 60 * 1000;
  const past = new Date(now.getTime() - hour);
  const future = new Date(now.getTime() + hour);

  // Helper for creating configurations quickly
  const createConfig = async (
    key: string,
    active: boolean,
    from: string | null,
    to: string | null,
  ) => {
    const created =
      await api.functional.todoApp.systemAdmin.serviceConfigurations.create(
        connection,
        {
          body: {
            namespace,
            environment,
            key,
            value: `v_${RandomGenerator.alphaNumeric(8)}`,
            value_type: "string",
            is_secret: false,
            description: RandomGenerator.paragraph({ sentences: 5 }),
            active,
            effective_from: from,
            effective_to: to,
          } satisfies ITodoAppServiceConfiguration.ICreate,
        },
      );
    typia.assert(created);
    return created;
  };

  // 2) Create records
  const includeKeys = [
    "effective_open",
    "from_past_to_future",
    "from_past_open",
    "to_future_open",
  ] as const;
  const excludeKeys = [
    "from_future",
    "to_past",
    "inactive_current",
    "inactive_open",
  ] as const;

  // Included cases
  await createConfig(includeKeys[0], true, null, null);
  await createConfig(
    includeKeys[1],
    true,
    past.toISOString(),
    future.toISOString(),
  );
  await createConfig(includeKeys[2], true, past.toISOString(), null);
  await createConfig(includeKeys[3], true, null, future.toISOString());

  // Excluded cases
  await createConfig(excludeKeys[0], true, future.toISOString(), null);
  await createConfig(excludeKeys[1], true, null, past.toISOString());
  await createConfig(
    excludeKeys[2],
    false,
    past.toISOString(),
    future.toISOString(),
  );
  await createConfig(excludeKeys[3], false, null, null);

  // 3) Search with filters (use small literals for pagination)
  const page =
    await api.functional.todoApp.systemAdmin.serviceConfigurations.index(
      connection,
      {
        body: {
          page: 1 as number,
          limit: 50 as number,
          namespace,
          environment,
          active: true,
          effective_at: now.toISOString(),
        } satisfies ITodoAppServiceConfiguration.IRequest,
      },
    );
  typia.assert(page);

  // 4) Validate results
  const actualKeys = page.data.map((r) => r.key).sort();
  const expectedKeys = [...includeKeys].slice().sort();

  // Equality check: only included keys must appear
  TestValidator.equals(
    "filtered keys must match expected included set",
    actualKeys,
    expectedKeys,
  );

  // Negative check: excluded keys must be absent
  for (const k of excludeKeys) {
    TestValidator.predicate(
      `excluded key ${k} must not be present`,
      actualKeys.includes(k) === false,
    );
  }

  // Every record must belong to our namespace/env, be active, and effective at now
  const nowMs = now.getTime();
  for (const rec of page.data) {
    TestValidator.equals("namespace must match", rec.namespace, namespace);
    TestValidator.equals(
      "environment must match",
      rec.environment ?? null,
      environment,
    );

    TestValidator.predicate(
      `record ${rec.key} must be active`,
      rec.active === true,
    );

    const fromOk =
      rec.effective_from === null || rec.effective_from === undefined
        ? true
        : new Date(rec.effective_from).getTime() <= nowMs;
    const toOk =
      rec.effective_to === null || rec.effective_to === undefined
        ? true
        : nowMs <= new Date(rec.effective_to).getTime();
    TestValidator.predicate(
      `record ${rec.key} must be effective at now`,
      fromOk && toOk,
    );
  }

  // Basic pagination sanity
  TestValidator.equals("pagination current page", page.pagination.current, 1);
  TestValidator.predicate(
    "pagination limit should be >= expected item count",
    page.pagination.limit >= expectedKeys.length,
  );
  TestValidator.predicate(
    "records should be >= expected item count",
    page.pagination.records >= expectedKeys.length,
  );
  TestValidator.predicate("pages should be >= 1", page.pagination.pages >= 1);
}
