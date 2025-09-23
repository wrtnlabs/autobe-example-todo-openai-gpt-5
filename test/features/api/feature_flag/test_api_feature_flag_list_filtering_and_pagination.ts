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
 * Validate policy-scoped listing, filtering, sorting, and pagination of feature
 * flags.
 *
 * Flow:
 *
 * 1. Admin joins to obtain authorized context
 * 2. Create a new service policy
 * 3. Seed multiple feature flags (varied namespace/env/active/rollout and
 *    keyworded names/codes)
 * 4. List under that policy and validate scoping
 * 5. Filter by active state, namespace, environment
 * 6. Search by keyword (code/name)
 * 7. Validate pagination (page/limit, non-overlap)
 * 8. Validate sorting by code (asc/desc)
 */
export async function test_api_feature_flag_list_filtering_and_pagination(
  connection: api.IConnection,
) {
  // 1) Admin join (authorized context)
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
        ip: "127.0.0.1",
        user_agent: "e2e-test-suite",
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(admin);

  // 2) Create a new service policy
  const policyBody = {
    namespace: "feature_governance",
    code: `pol_${RandomGenerator.alphaNumeric(10)}`,
    name: `Policy ${RandomGenerator.name(2)}`,
    description: RandomGenerator.paragraph({ sentences: 8 }),
    value: '{"mode":"strict"}',
    value_type: "string",
    active: true,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBody },
    );
  typia.assert(policy);

  // 3) Seed multiple feature flags with varied attributes
  const suffix = RandomGenerator.alphaNumeric(6);
  const seeds: readonly (ITodoAppFeatureFlag.ICreate & { __label: string })[] =
    [
      {
        namespace: "ui",
        environment: "prod",
        code: `alpha_prod_${suffix}`,
        name: "Alpha Feature",
        description: "Alpha flag for production",
        active: true,
        rollout_percentage: 100,
        target_audience: "all users",
        __label: "alpha_prod",
      },
      {
        namespace: "ui",
        environment: "dev",
        code: `beta_dev_${suffix}`,
        name: "Beta Toggle",
        description: "Beta flag for development",
        active: false,
        rollout_percentage: 25,
        target_audience: "internal",
        __label: "beta_dev",
      },
      {
        namespace: "sync",
        environment: "prod",
        code: `gamma_prod_${suffix}`,
        name: "Gamma Switch",
        description: "Gamma rollout on prod",
        active: true,
        rollout_percentage: 0,
        target_audience: null,
        __label: "gamma_prod",
      },
      {
        namespace: "sync",
        environment: null,
        code: `delta_${suffix}`,
        name: "Delta Flag",
        description: "Env-agnostic delta",
        active: false,
        rollout_percentage: 25,
        target_audience: "beta-testers",
        __label: "delta_nullenv",
      },
      {
        namespace: "ui",
        environment: "prod",
        code: `omega_prod_${suffix}`,
        name: "Omega Feature",
        description: "Omega prod",
        active: true,
        rollout_percentage: 100,
        target_audience: null,
        __label: "omega_prod",
      },
      {
        namespace: "sync",
        environment: "dev",
        code: `zeta_dev_${suffix}`,
        name: "Zeta Toggle",
        description: "Zeta dev",
        active: false,
        rollout_percentage: 0,
        target_audience: null,
        __label: "zeta_dev",
      },
    ];

  const createdFlags: ITodoAppFeatureFlag[] = [];
  for (const s of seeds) {
    const created: ITodoAppFeatureFlag =
      await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
        connection,
        {
          policyId: policy.id,
          body: {
            namespace: s.namespace,
            environment: s.environment ?? null,
            code: s.code,
            name: s.name,
            description: s.description ?? null,
            active: s.active,
            rollout_percentage: s.rollout_percentage,
            target_audience: s.target_audience ?? null,
          } satisfies ITodoAppFeatureFlag.ICreate,
        },
      );
    typia.assert(created);
    createdFlags.push(created);
  }

  // 4) Baseline list all under the policy (scoping and completeness)
  const pageAll =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.index(
      connection,
      {
        policyId: policy.id,
        body: {
          page: 1,
          limit: 100,
          order_by: "created_at",
          order_dir: "desc",
        } satisfies ITodoAppFeatureFlag.IRequest,
      },
    );
  typia.assert(pageAll);

  // Verify every listed item (if field exists) is bound to our policy and that the set equals created set
  for (const it of pageAll.data) {
    if (
      it.todo_app_service_policy_id !== undefined &&
      it.todo_app_service_policy_id !== null
    )
      TestValidator.equals(
        "listed item policy id matches created policy id",
        it.todo_app_service_policy_id,
        policy.id,
      );
  }
  TestValidator.equals(
    "listing includes exactly the seeded flags (count match)",
    pageAll.data.length,
    createdFlags.length,
  );
  const allIds = pageAll.data.map((d) => d.id);
  for (const f of createdFlags) {
    TestValidator.predicate(
      `seeded flag present in listing: ${f.code}`,
      allIds.includes(f.id),
    );
  }

  // 5) Filtering validations
  // 5-a) active=true
  const activeTrue =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.index(
      connection,
      {
        policyId: policy.id,
        body: {
          active: true,
          limit: 100,
        } satisfies ITodoAppFeatureFlag.IRequest,
      },
    );
  typia.assert(activeTrue);
  for (const it of activeTrue.data) {
    TestValidator.predicate(
      "active=true filter returns only active",
      it.active === true,
    );
  }
  const expectedActiveIds = createdFlags
    .filter((f) => f.active)
    .map((f) => f.id);
  for (const id of expectedActiveIds) {
    TestValidator.predicate(
      "active=true results include each created active flag",
      activeTrue.data.some((d) => d.id === id),
    );
  }

  // 5-b) active=false
  const activeFalse =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.index(
      connection,
      {
        policyId: policy.id,
        body: {
          active: false,
          limit: 100,
        } satisfies ITodoAppFeatureFlag.IRequest,
      },
    );
  typia.assert(activeFalse);
  for (const it of activeFalse.data) {
    TestValidator.predicate(
      "active=false filter returns only inactive",
      it.active === false,
    );
  }

  // 5-c) namespace filter (choose "ui")
  const ns = "ui";
  const byNamespace =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.index(
      connection,
      {
        policyId: policy.id,
        body: {
          namespace: ns,
          limit: 100,
        } satisfies ITodoAppFeatureFlag.IRequest,
      },
    );
  typia.assert(byNamespace);
  for (const it of byNamespace.data) {
    TestValidator.equals(
      "namespace filter returns only requested namespace",
      it.namespace,
      ns,
    );
  }

  // 5-d) environment filter (choose "prod")
  const env = "prod";
  const byEnvironment =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.index(
      connection,
      {
        policyId: policy.id,
        body: {
          environment: env,
          limit: 100,
        } satisfies ITodoAppFeatureFlag.IRequest,
      },
    );
  typia.assert(byEnvironment);
  for (const it of byEnvironment.data) {
    TestValidator.equals(
      "environment filter returns only requested environment",
      it.environment ?? env,
      env,
    );
  }

  // 6) Search validation (use keyword from one of the seeds e.g., "alpha")
  const keyword = "alpha";
  const searchPage =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.index(
      connection,
      {
        policyId: policy.id,
        body: {
          search: keyword,
          limit: 100,
        } satisfies ITodoAppFeatureFlag.IRequest,
      },
    );
  typia.assert(searchPage);
  for (const it of searchPage.data) {
    const nameLc = (it.name ?? "").toLowerCase();
    const codeLc = (it.code ?? "").toLowerCase();
    TestValidator.predicate(
      "search results contain the keyword in code or name (case-insensitive)",
      nameLc.includes(keyword) || codeLc.includes(keyword),
    );
  }

  // 7) Pagination validation (page 1 & 2, limit 2, consistent ordering)
  const page1 =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.index(
      connection,
      {
        policyId: policy.id,
        body: {
          page: 1,
          limit: 2,
          order_by: "created_at",
          order_dir: "desc",
        } satisfies ITodoAppFeatureFlag.IRequest,
      },
    );
  typia.assert(page1);
  TestValidator.equals("page1 limit equals request", page1.pagination.limit, 2);
  TestValidator.equals(
    "page1 current equals request",
    page1.pagination.current,
    1,
  );
  TestValidator.predicate("page1 data length <= limit", page1.data.length <= 2);

  const page2 =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.index(
      connection,
      {
        policyId: policy.id,
        body: {
          page: 2,
          limit: 2,
          order_by: "created_at",
          order_dir: "desc",
        } satisfies ITodoAppFeatureFlag.IRequest,
      },
    );
  typia.assert(page2);
  TestValidator.equals("page2 limit equals request", page2.pagination.limit, 2);
  TestValidator.equals(
    "page2 current equals request",
    page2.pagination.current,
    2,
  );
  TestValidator.predicate("page2 data length <= limit", page2.data.length <= 2);

  const page1Ids = page1.data.map((d) => d.id);
  const page2Ids = page2.data.map((d) => d.id);
  TestValidator.predicate(
    "consecutive pages do not overlap",
    page1Ids.every((id) => !page2Ids.includes(id)),
  );

  // 8) Sorting by code asc and desc (compare only our seeded set)
  const sortedAsc =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.index(
      connection,
      {
        policyId: policy.id,
        body: {
          limit: 100,
          order_by: "code",
          order_dir: "asc",
        } satisfies ITodoAppFeatureFlag.IRequest,
      },
    );
  typia.assert(sortedAsc);
  const ascFiltered = sortedAsc.data.filter((d) =>
    createdFlags.some((f) => f.id === d.id),
  );
  TestValidator.equals(
    "asc list contains all seeded flags (count match)",
    ascFiltered.length,
    createdFlags.length,
  );
  const expectedAsc = createdFlags
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code));
  TestValidator.index(
    "sorting by code asc matches order of seeded flags",
    expectedAsc,
    ascFiltered,
  );

  const sortedDesc =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.index(
      connection,
      {
        policyId: policy.id,
        body: {
          limit: 100,
          order_by: "code",
          order_dir: "desc",
        } satisfies ITodoAppFeatureFlag.IRequest,
      },
    );
  typia.assert(sortedDesc);
  const descFiltered = sortedDesc.data.filter((d) =>
    createdFlags.some((f) => f.id === d.id),
  );
  TestValidator.equals(
    "desc list contains all seeded flags (count match)",
    descFiltered.length,
    createdFlags.length,
  );
  const expectedDesc = createdFlags
    .slice()
    .sort((a, b) => b.code.localeCompare(a.code));
  TestValidator.index(
    "sorting by code desc matches order of seeded flags",
    expectedDesc,
    descFiltered,
  );
}
