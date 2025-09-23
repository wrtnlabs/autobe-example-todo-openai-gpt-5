import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { EOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/EOrderDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppFeatureFlag } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppFeatureFlag";
import type { ITodoAppFeatureFlag } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppFeatureFlag";
import type { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Validate listing, filtering, searching, and sorting of feature flags.
 *
 * Flow:
 *
 * 1. Join as a system admin.
 * 2. Create two service policies for realistic environment.
 * 3. Create several feature flags: some scoped to a policy, others global.
 *
 *    - Ensure diversity in namespace, environment, active, rollout, and time
 *         windows.
 * 4. Exercise PATCH /todoApp/systemAdmin/featureFlags with:
 *
 *    - Exact code filtering (deterministic presence)
 *    - Namespace filter (+ inclusion check)
 *    - Environment filter (+ inclusion check)
 *    - Active=true filter (+ inclusion check)
 *    - Rollout range filter (min/max)
 *    - Effective_now_only=true filter (active + within start/end)
 *    - Free-text search
 *    - Sorting by code asc and rollout_percentage desc
 *
 * Notes:
 *
 * - Policy-id filter is not part of IRequest, so we omit it despite creating a
 *   policy.
 */
export async function test_api_feature_flag_listing_filtering_and_sorting(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: "P@ssw0rd" + RandomGenerator.alphaNumeric(8),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // Utility timestamps for time window testing
  const now = new Date();
  const oneHourMs = 60 * 60 * 1000;
  const pastOneHourIso = new Date(now.getTime() - oneHourMs).toISOString();
  const futureOneHourIso = new Date(now.getTime() + oneHourMs).toISOString();

  // 2) Create two service policies
  const policyA =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: {
          namespace: "governance",
          code: `pol_${RandomGenerator.alphaNumeric(10)}`,
          name: RandomGenerator.name(2),
          description: RandomGenerator.paragraph({ sentences: 6 }),
          value: "true",
          value_type: "boolean",
          active: true,
          effective_from: null,
          effective_to: null,
        } satisfies ITodoAppServicePolicy.ICreate,
      },
    );
  typia.assert(policyA);

  const policyB =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: {
          namespace: "retention",
          code: `pol_${RandomGenerator.alphaNumeric(10)}`,
          name: RandomGenerator.name(2),
          description: RandomGenerator.paragraph({ sentences: 4 }),
          value: "P30D",
          value_type: "duration",
          active: true,
          effective_from: null,
          effective_to: null,
        } satisfies ITodoAppServicePolicy.ICreate,
      },
    );
  typia.assert(policyB);

  // Namespaces for flags
  const nsUi = "ui";
  const nsSync = "sync";

  // 3) Create feature flags
  // 3-1) Policy-scoped flags under policyA
  const flagA1 =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
      connection,
      {
        policyId: policyA.id,
        body: {
          namespace: nsUi,
          environment: "prod",
          code: `ff_${RandomGenerator.alphaNumeric(8)}`,
          name: RandomGenerator.name(2),
          description: RandomGenerator.paragraph({ sentences: 5 }),
          active: true,
          rollout_percentage: 50,
          target_audience: "early adopters",
          start_at: null,
          end_at: null,
        } satisfies ITodoAppFeatureFlag.ICreate,
      },
    );
  typia.assert(flagA1);

  const flagA2 =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
      connection,
      {
        policyId: policyA.id,
        body: {
          namespace: nsUi,
          environment: "staging",
          code: `ff_${RandomGenerator.alphaNumeric(8)}`,
          name: RandomGenerator.name(2),
          description: RandomGenerator.paragraph({ sentences: 3 }),
          active: false,
          rollout_percentage: 0,
          target_audience: null,
          start_at: null,
          end_at: null,
        } satisfies ITodoAppFeatureFlag.ICreate,
      },
    );
  typia.assert(flagA2);

  // This one is active and currently effective within a 2-hour window centered on now
  const flagA3 =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
      connection,
      {
        policyId: policyA.id,
        body: {
          namespace: nsUi,
          environment: null,
          code: `ff_${RandomGenerator.alphaNumeric(8)}`,
          name: RandomGenerator.name(2),
          description: RandomGenerator.paragraph({ sentences: 4 }),
          active: true,
          rollout_percentage: 10,
          target_audience: "rollout cohort",
          start_at: pastOneHourIso,
          end_at: futureOneHourIso,
        } satisfies ITodoAppFeatureFlag.ICreate,
      },
    );
  typia.assert(flagA3);

  // 3-2) Global flags (not bound to a policy)
  const flagG1 = await api.functional.todoApp.systemAdmin.featureFlags.create(
    connection,
    {
      body: {
        namespace: nsSync,
        environment: "dev",
        code: `ff_${RandomGenerator.alphaNumeric(8)}`,
        name: RandomGenerator.name(2),
        description: RandomGenerator.paragraph({ sentences: 4 }),
        active: true,
        rollout_percentage: 75,
        target_audience: null,
        start_at: null,
        end_at: null,
      } satisfies ITodoAppFeatureFlag.ICreate,
    },
  );
  typia.assert(flagG1);

  const flagG2 = await api.functional.todoApp.systemAdmin.featureFlags.create(
    connection,
    {
      body: {
        namespace: nsUi,
        environment: "prod",
        code: `ff_${RandomGenerator.alphaNumeric(8)}`,
        name: RandomGenerator.name(2),
        description: RandomGenerator.paragraph({ sentences: 2 }),
        active: true,
        rollout_percentage: 90,
        target_audience: "all users",
        start_at: null,
        end_at: null,
      } satisfies ITodoAppFeatureFlag.ICreate,
    },
  );
  typia.assert(flagG2);

  // Common pagination settings
  const page = 1 as const;
  const limit = 100 as const;

  // 4) Listing checks
  // 4-1) Exact code filter for deterministic result: pick flagA1
  {
    const pageByCode =
      await api.functional.todoApp.systemAdmin.featureFlags.index(connection, {
        body: {
          page,
          limit,
          code: flagA1.code,
        } satisfies ITodoAppFeatureFlag.IRequest,
      });
    typia.assert(pageByCode);
    TestValidator.predicate(
      "exact code filter returns the specific record",
      pageByCode.data.some((f) => f.id === flagA1.id),
    );
  }

  // 4-2) Namespace filter: nsUi (+ inclusion check using code)
  {
    const nsRes = await api.functional.todoApp.systemAdmin.featureFlags.index(
      connection,
      {
        body: {
          page,
          limit,
          namespace: nsUi,
        } satisfies ITodoAppFeatureFlag.IRequest,
      },
    );
    typia.assert(nsRes);
    TestValidator.predicate(
      "namespace filter: all items must match namespace",
      nsRes.data.every((it) => it.namespace === nsUi),
    );
    const nsByCode =
      await api.functional.todoApp.systemAdmin.featureFlags.index(connection, {
        body: {
          page,
          limit,
          namespace: nsUi,
          code: flagG2.code, // flagG2 is nsUi
        } satisfies ITodoAppFeatureFlag.IRequest,
      });
    typia.assert(nsByCode);
    TestValidator.predicate(
      "namespace filter must include a known nsUi record",
      nsByCode.data.some((it) => it.id === flagG2.id),
    );
  }

  // 4-3) Environment filter: prod (+ inclusion check using code)
  {
    const env = "prod" as const;
    const envRes = await api.functional.todoApp.systemAdmin.featureFlags.index(
      connection,
      {
        body: {
          page,
          limit,
          environment: env,
        } satisfies ITodoAppFeatureFlag.IRequest,
      },
    );
    typia.assert(envRes);
    TestValidator.predicate(
      "environment filter: all items must match environment",
      envRes.data.every((it) => it.environment === env),
    );

    const envByCode =
      await api.functional.todoApp.systemAdmin.featureFlags.index(connection, {
        body: {
          page,
          limit,
          environment: env,
          code: flagA1.code, // prod
        } satisfies ITodoAppFeatureFlag.IRequest,
      });
    typia.assert(envByCode);
    TestValidator.predicate(
      "environment filter must include a known prod record",
      envByCode.data.some((it) => it.id === flagA1.id),
    );
  }

  // 4-4) Active=true filter (+ inclusion check using code)
  {
    const activeRes =
      await api.functional.todoApp.systemAdmin.featureFlags.index(connection, {
        body: {
          page,
          limit,
          active: true,
        } satisfies ITodoAppFeatureFlag.IRequest,
      });
    typia.assert(activeRes);
    TestValidator.predicate(
      "active filter: all items must be active",
      activeRes.data.every((it) => it.active === true),
    );

    const activeByCode =
      await api.functional.todoApp.systemAdmin.featureFlags.index(connection, {
        body: {
          page,
          limit,
          active: true,
          code: flagG2.code, // active=true
        } satisfies ITodoAppFeatureFlag.IRequest,
      });
    typia.assert(activeByCode);
    TestValidator.predicate(
      "active filter must include a known active record",
      activeByCode.data.some((it) => it.id === flagG2.id),
    );
  }

  // 4-5) Rollout range filter to include 50% (flagA1)
  {
    const min = 40;
    const max = 60;
    const rangeRes =
      await api.functional.todoApp.systemAdmin.featureFlags.index(connection, {
        body: {
          page,
          limit,
          rollout_min: min,
          rollout_max: max,
        } satisfies ITodoAppFeatureFlag.IRequest,
      });
    typia.assert(rangeRes);
    TestValidator.predicate(
      "rollout range filter: all items within [40,60]",
      rangeRes.data.every(
        (it) => it.rollout_percentage >= min && it.rollout_percentage <= max,
      ),
    );

    const rangeByCode =
      await api.functional.todoApp.systemAdmin.featureFlags.index(connection, {
        body: {
          page,
          limit,
          rollout_min: min,
          rollout_max: max,
          code: flagA1.code,
        } satisfies ITodoAppFeatureFlag.IRequest,
      });
    typia.assert(rangeByCode);
    TestValidator.predicate(
      "rollout range plus exact code should include 50% flag",
      rangeByCode.data.some((it) => it.id === flagA1.id),
    );
  }

  // 4-6) effective_now_only=true should restrict to active and within window when provided
  {
    const effRes = await api.functional.todoApp.systemAdmin.featureFlags.index(
      connection,
      {
        body: {
          page,
          limit,
          effective_now_only: true,
        } satisfies ITodoAppFeatureFlag.IRequest,
      },
    );
    typia.assert(effRes);
    const nowMs = now.getTime();
    TestValidator.predicate(
      "effective_now_only: items are active and in time window when defined",
      effRes.data.every((it) => {
        if (it.active !== true) return false;
        const startOk =
          it.start_at == null ? true : new Date(it.start_at).getTime() <= nowMs;
        const endOk =
          it.end_at == null ? true : nowMs < new Date(it.end_at).getTime();
        return startOk && endOk;
      }),
    );

    // Also ensure our time-bounded flag (flagA3) is included when filtering by its code
    const effByCode =
      await api.functional.todoApp.systemAdmin.featureFlags.index(connection, {
        body: {
          page,
          limit,
          effective_now_only: true,
          code: flagA3.code,
        } satisfies ITodoAppFeatureFlag.IRequest,
      });
    typia.assert(effByCode);
    TestValidator.predicate(
      "effective_now_only with exact code should include the time-bounded flag",
      effByCode.data.some((it) => it.id === flagA3.id),
    );
  }

  // 4-7) Free-text search on name/description
  {
    const base = `${flagG1.name} ${flagG1.description ?? ""}`.trim();
    const needle =
      base.length > 0 ? RandomGenerator.substring(base) : flagG1.name;
    const searchRes =
      await api.functional.todoApp.systemAdmin.featureFlags.index(connection, {
        body: {
          page,
          limit,
          search: needle,
        } satisfies ITodoAppFeatureFlag.IRequest,
      });
    typia.assert(searchRes);
    TestValidator.predicate(
      "free-text search should include a known matching flag",
      searchRes.data.some((it) => it.id === flagG1.id),
    );
  }

  // 4-8) Sorting by code ascending
  {
    const sortedByCode =
      await api.functional.todoApp.systemAdmin.featureFlags.index(connection, {
        body: {
          page,
          limit,
          order_by: "code",
          order_dir: "asc",
        } satisfies ITodoAppFeatureFlag.IRequest,
      });
    typia.assert(sortedByCode);

    const expected = [...sortedByCode.data].sort((a, b) =>
      a.code.localeCompare(b.code),
    );
    TestValidator.equals(
      "code ascending order must be respected",
      sortedByCode.data,
      expected,
    );
  }

  // 4-9) Sorting by rollout_percentage descending
  {
    const sortedByRolloutDesc =
      await api.functional.todoApp.systemAdmin.featureFlags.index(connection, {
        body: {
          page,
          limit,
          order_by: "rollout_percentage",
          order_dir: "desc",
        } satisfies ITodoAppFeatureFlag.IRequest,
      });
    typia.assert(sortedByRolloutDesc);

    const expected = [...sortedByRolloutDesc.data].sort(
      (a, b) => b.rollout_percentage - a.rollout_percentage,
    );
    TestValidator.equals(
      "rollout_percentage descending order must be respected",
      sortedByRolloutDesc.data,
      expected,
    );
  }
}
