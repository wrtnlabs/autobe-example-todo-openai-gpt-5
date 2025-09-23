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
import type { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

export async function test_api_service_configuration_search_filtering_pagination_under_policy(
  connection: api.IConnection,
) {
  /**
   * Validate listing/search of service configurations under a policy with
   * filtering, sorting, pagination, and redaction.
   *
   * Steps:
   *
   * 1. Authenticate as systemAdmin
   * 2. Create two policies (primary for test scope, other for exclusion check)
   * 3. Seed configurations under primary policy with varied
   *    env/active/is_secret/value_type/effective windows
   *
   *    - Ensure at least four matching records (environment=prod, active=true),
   *         including a secret one
   *    - Seed non-matching records and one record under other policy for scoping
   *         verification
   * 4. Call index with filters (active=true, environment=prod), orderBy=created_at
   *    desc, small limit to exercise pagination
   * 5. Validate: scoping, filters, sorting, pagination window consistency and
   *    redaction in summaries
   * 6. Error validations: reject limit>100, reject malformed effective_at
   */

  // 1) Authenticate as systemAdmin
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 2) Create two policies (primary, other) to verify scoping
  const policyCode = `policy_${RandomGenerator.alphaNumeric(8)}`;
  const primaryPolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: {
          namespace: "core.app",
          code: policyCode,
          name: `Primary ${RandomGenerator.name(2)}`,
          description: RandomGenerator.paragraph({ sentences: 6 }),
          value: "true",
          value_type: "boolean",
          active: true,
        } satisfies ITodoAppServicePolicy.ICreate,
      },
    );
  typia.assert(primaryPolicy);

  const otherPolicyCode = `policy_${RandomGenerator.alphaNumeric(8)}`;
  const otherPolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: {
          namespace: "core.app",
          code: otherPolicyCode,
          name: `Other ${RandomGenerator.name(2)}`,
          description: RandomGenerator.paragraph({ sentences: 4 }),
          value: "true",
          value_type: "boolean",
          active: true,
        } satisfies ITodoAppServicePolicy.ICreate,
      },
    );
  typia.assert(otherPolicy);

  // Helper to create config under a policy with uniqueness guarantees
  const createConfig = async (
    polId: string & tags.Format<"uuid">,
    p: {
      namespace: string;
      environment: string | null;
      keyBase: string;
      is_secret: boolean;
      active: boolean;
      value_type: EConfigValueType;
      value: string;
      effective_from?: string | null;
      effective_to?: string | null;
    },
    idx: number,
  ) => {
    const key = `${p.keyBase}_${idx}_${RandomGenerator.alphaNumeric(4)}`;
    const body = {
      namespace: p.namespace,
      environment: p.environment,
      key,
      value: p.value,
      value_type: p.value_type,
      is_secret: p.is_secret,
      description: RandomGenerator.paragraph({ sentences: 5 }),
      active: p.active,
      effective_from: p.effective_from ?? null,
      effective_to: p.effective_to ?? null,
    } satisfies ITodoAppServiceConfiguration.ICreate;
    const created =
      await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.create(
        connection,
        {
          policyId: polId,
          body,
        },
      );
    typia.assert(created);
    return created;
  };

  // 3) Seed configurations
  const now = new Date();
  const pastIso = new Date(
    now.getTime() - 3 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const futureIso = new Date(
    now.getTime() + 3 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const prodActives: ITodoAppServiceConfiguration[] = [];
  // Four matching records: environment=prod, active=true (include one secret)
  for (let i = 0; i < 4; i++) {
    const secret = i === 1; // ensure at least one secret
    const vt: EConfigValueType = i % 2 === 0 ? "string" : "boolean";
    const val =
      vt === "string"
        ? RandomGenerator.name(1)
        : i % 2 === 0
          ? "true"
          : "false";
    const created = await createConfig(
      primaryPolicy.id,
      {
        namespace: "core.app",
        environment: "prod",
        keyBase: "list_target",
        is_secret: secret,
        active: true,
        value_type: vt,
        value: val,
        effective_from: i % 2 === 0 ? pastIso : null,
        effective_to: null,
      },
      i,
    );
    prodActives.push(created);
  }

  // Non-matching in same policy (staging, inactive, null env)
  await createConfig(
    primaryPolicy.id,
    {
      namespace: "core.app",
      environment: "staging",
      keyBase: "staging_only",
      is_secret: false,
      active: true,
      value_type: "string",
      value: RandomGenerator.paragraph({ sentences: 3 }),
      effective_from: pastIso,
      effective_to: futureIso,
    },
    0,
  );
  await createConfig(
    primaryPolicy.id,
    {
      namespace: "core.app",
      environment: "prod",
      keyBase: "inactive_in_prod",
      is_secret: false,
      active: false,
      value_type: "int",
      value: "42",
      effective_from: null,
      effective_to: null,
    },
    0,
  );
  await createConfig(
    primaryPolicy.id,
    {
      namespace: "core.app",
      environment: null,
      keyBase: "global_env",
      is_secret: false,
      active: true,
      value_type: "uri",
      value: "https://example.com",
      effective_from: null,
      effective_to: null,
    },
    0,
  );

  // Other policy (should be excluded by scoping)
  await createConfig(
    otherPolicy.id,
    {
      namespace: "core.app",
      environment: "prod",
      keyBase: "other_policy",
      is_secret: false,
      active: true,
      value_type: "string",
      value: "x",
      effective_from: null,
      effective_to: null,
    },
    0,
  );

  // 4) Call index with filters, order and pagination
  const orderBy: EServiceConfigurationOrderBy = "created_at";
  const order: ESortOrder = "desc";
  const limit = 2;

  const page1 =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.index(
      connection,
      {
        policyId: primaryPolicy.id,
        body: {
          page: 1,
          limit,
          environment: "prod",
          active: true,
          orderBy,
          order,
        } satisfies ITodoAppServiceConfiguration.IRequest,
      },
    );
  typia.assert(page1);

  const page2 =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.index(
      connection,
      {
        policyId: primaryPolicy.id,
        body: {
          page: 2,
          limit,
          environment: "prod",
          active: true,
          orderBy,
          order,
        } satisfies ITodoAppServiceConfiguration.IRequest,
      },
    );
  typia.assert(page2);

  const full =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.index(
      connection,
      {
        policyId: primaryPolicy.id,
        body: {
          page: 1,
          limit: 100,
          environment: "prod",
          active: true,
          orderBy,
          order,
        } satisfies ITodoAppServiceConfiguration.IRequest,
      },
    );
  typia.assert(full);

  // 5) Validations
  // Helper: check descending by created_at
  const isDesc = (arr: ITodoAppServiceConfiguration.ISummary[]) =>
    arr.every((elem, idx, a) =>
      idx === 0 ? true : a[idx - 1].created_at >= elem.created_at,
    );

  // Scope & filters on page1
  for (const s of page1.data) {
    TestValidator.equals(
      "scoped to policy (page1)",
      s.todo_app_service_policy_id,
      primaryPolicy.id,
    );
    TestValidator.predicate("filter active=true (page1)", s.active === true);
    TestValidator.predicate(
      "filter environment=prod (page1)",
      s.environment === "prod",
    );
    TestValidator.predicate("no raw value in summary (page1)", !("value" in s));
  }
  TestValidator.predicate("sorted desc (page1)", isDesc(page1.data));
  TestValidator.equals(
    "pagination.limit echoes request (page1)",
    page1.pagination.limit,
    limit,
  );
  TestValidator.predicate(
    "pagination.records >= data.length (page1)",
    page1.pagination.records >= page1.data.length,
  );
  TestValidator.predicate(
    "pagination.pages >= 1 (page1)",
    page1.pagination.pages >= 1,
  );

  // Scope & filters on page2
  for (const s of page2.data) {
    TestValidator.equals(
      "scoped to policy (page2)",
      s.todo_app_service_policy_id,
      primaryPolicy.id,
    );
    TestValidator.predicate("filter active=true (page2)", s.active === true);
    TestValidator.predicate(
      "filter environment=prod (page2)",
      s.environment === "prod",
    );
    TestValidator.predicate("no raw value in summary (page2)", !("value" in s));
  }
  TestValidator.predicate("sorted desc (page2)", isDesc(page2.data));
  TestValidator.equals(
    "pagination.limit echoes request (page2)",
    page2.pagination.limit,
    limit,
  );
  TestValidator.predicate(
    "pagination.records >= data.length (page2)",
    page2.pagination.records >= page2.data.length,
  );
  TestValidator.predicate(
    "pagination.pages >= 1 (page2)",
    page2.pagination.pages >= 1,
  );

  // Ensure we actually have seeded >= 4 matching, so two pages should contain up to 4 items
  TestValidator.predicate(
    "full list must contain at least 4 matching records",
    full.data.length >= 4,
  );

  // Page window consistency: page1+page2 equals top 4 of full (by id sequence)
  const combinedIds = [...page1.data, ...page2.data].map((x) => x.id);
  const top4Ids = full.data.slice(0, 4).map((x) => x.id);
  TestValidator.equals(
    "first two pages match top-4 of full listing",
    combinedIds,
    top4Ids,
  );

  // Cross-page ordering boundary: last of page1 >= first of page2
  if (page1.data.length > 0 && page2.data.length > 0) {
    const last1 = page1.data[page1.data.length - 1].created_at;
    const first2 = page2.data[0].created_at;
    TestValidator.predicate("boundary respects desc order", last1 >= first2);
  }

  // Uniqueness across pages
  const unique = new Set(combinedIds);
  TestValidator.equals(
    "no duplicates across first two pages",
    unique.size,
    combinedIds.length,
  );

  // Redaction & secret presence (use full list to avoid pagination flakiness)
  TestValidator.predicate(
    "at least one secret exists in full listing",
    full.data.some((s) => s.is_secret === true),
  );
  for (const s of full.data) {
    TestValidator.predicate(
      "no raw value in any summary (full)",
      !("value" in s),
    );
  }
  TestValidator.predicate("sorted desc (full)", isDesc(full.data));

  // 6) Error scenarios (runtime validation)
  await TestValidator.error("reject limit > 100", async () => {
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.index(
      connection,
      {
        policyId: primaryPolicy.id,
        body: {
          page: 1,
          limit: 1000,
          environment: "prod",
          active: true,
          orderBy,
          order,
        } satisfies ITodoAppServiceConfiguration.IRequest,
      },
    );
  });

  await TestValidator.error(
    "reject malformed effective_at format",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.index(
        connection,
        {
          policyId: primaryPolicy.id,
          body: {
            page: 1,
            limit: 1,
            effective_at: "not-a-date",
          } satisfies ITodoAppServiceConfiguration.IRequest,
        },
      );
    },
  );
}
