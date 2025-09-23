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

export async function test_api_feature_flag_list_time_window_filtering(
  connection: api.IConnection,
) {
  /**
   * Validate policy-scoped listing with time-window filtering for feature
   * flags.
   *
   * Steps:
   *
   * 1. Admin joins (auth token handled by SDK)
   * 2. Create a Service Policy
   * 3. Create 4 feature flags under the policy with windows: current, future,
   *    expired, no-window
   * 4. List with:
   *
   *    - All records (page/limit)
   *    - Effective_now_only = true (expect current + no-window)
   *    - Start_from > now (expect future only)
   *    - End_to = now (expect expired only)
   */
  // 1) Admin join
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: "password123",
      user_agent: RandomGenerator.name(1),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 2) Create parent policy
  const policyBody = {
    namespace: "feature",
    code: `policy_${RandomGenerator.alphaNumeric(8)}`,
    name: `Time-window policy ${RandomGenerator.alphaNumeric(6)}`,
    description: RandomGenerator.paragraph({ sentences: 8 }),
    value: "true",
    value_type: "boolean",
    active: true,
    effective_from: null,
    effective_to: null,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBody },
    );
  typia.assert(policy);

  // 3) Create 4 feature flags with varied time windows
  const now = new Date();
  const isoFromNow = (ms: number) => new Date(now.getTime() + ms).toISOString();

  const startPast = isoFromNow(-10 * 60 * 1000); // 10 minutes ago
  const endSoon = isoFromNow(10 * 60 * 1000); // 10 minutes later
  const startFuture = isoFromNow(60 * 60 * 1000); // 1 hour later
  const endFuture = isoFromNow(2 * 60 * 60 * 1000); // 2 hours later
  const startLongPast = isoFromNow(-2 * 60 * 60 * 1000); // 2 hours ago
  const endPast = isoFromNow(-60 * 60 * 1000); // 1 hour ago

  const common = {
    namespace: "ui",
    environment: "dev",
    active: true,
    rollout_percentage: 100,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    target_audience: RandomGenerator.paragraph({ sentences: 5 }),
  } as const;

  // current: within window now
  const createCurrent = {
    ...common,
    code: `flag_${RandomGenerator.alphaNumeric(6)}_curr`,
    name: `Current ${RandomGenerator.alphaNumeric(4)}`,
    start_at: startPast,
    end_at: endSoon,
  } satisfies ITodoAppFeatureFlag.ICreate;
  const flagCurrent =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
      connection,
      { policyId: policy.id, body: createCurrent },
    );
  typia.assert(flagCurrent);

  // future: starts later
  const createFuture = {
    ...common,
    code: `flag_${RandomGenerator.alphaNumeric(6)}_fut`,
    name: `Future ${RandomGenerator.alphaNumeric(4)}`,
    start_at: startFuture,
    end_at: endFuture,
  } satisfies ITodoAppFeatureFlag.ICreate;
  const flagFuture =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
      connection,
      { policyId: policy.id, body: createFuture },
    );
  typia.assert(flagFuture);

  // expired: ended already
  const createExpired = {
    ...common,
    code: `flag_${RandomGenerator.alphaNumeric(6)}_exp`,
    name: `Expired ${RandomGenerator.alphaNumeric(4)}`,
    start_at: startLongPast,
    end_at: endPast,
  } satisfies ITodoAppFeatureFlag.ICreate;
  const flagExpired =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
      connection,
      { policyId: policy.id, body: createExpired },
    );
  typia.assert(flagExpired);

  // no-window: effective with no start/end
  const createNoWindow = {
    ...common,
    code: `flag_${RandomGenerator.alphaNumeric(6)}_nowin`,
    name: `NoWindow ${RandomGenerator.alphaNumeric(4)}`,
    start_at: null,
    end_at: null,
  } satisfies ITodoAppFeatureFlag.ICreate;
  const flagNoWindow =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
      connection,
      { policyId: policy.id, body: createNoWindow },
    );
  typia.assert(flagNoWindow);

  // 4) Listing validations
  // Helper: sort ids for deterministic equality checks
  const sortIds = (ids: string[]) =>
    [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  // 4-1) All under policy
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
          namespace: common.namespace,
          environment: common.environment,
        } satisfies ITodoAppFeatureFlag.IRequest,
      },
    );
  typia.assert(pageAll);
  TestValidator.equals(
    "all: pagination.records should equal 4",
    pageAll.pagination.records,
    4,
  );
  const allIds = sortIds(pageAll.data.map((d) => d.id));
  const expectedAll = sortIds([
    flagCurrent.id,
    flagFuture.id,
    flagExpired.id,
    flagNoWindow.id,
  ]);
  TestValidator.equals(
    "all: returned ids set must match created ids",
    allIds,
    expectedAll,
  );

  // 4-2) effective_now_only = true => current + no-window
  const pageEffective =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.index(
      connection,
      {
        policyId: policy.id,
        body: {
          page: 1,
          limit: 100,
          effective_now_only: true,
          namespace: common.namespace,
          environment: common.environment,
        } satisfies ITodoAppFeatureFlag.IRequest,
      },
    );
  typia.assert(pageEffective);
  TestValidator.equals(
    "effective now: count should be 2 (current + no-window)",
    pageEffective.data.length,
    2,
  );
  const effectiveIds = sortIds(pageEffective.data.map((d) => d.id));
  const expectedEffective = sortIds([flagCurrent.id, flagNoWindow.id]);
  TestValidator.equals(
    "effective now: ids should be current and no-window",
    effectiveIds,
    expectedEffective,
  );

  // 4-3) start_from > now => future only
  const pageFuture =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.index(
      connection,
      {
        policyId: policy.id,
        body: {
          page: 1,
          limit: 100,
          start_from: isoFromNow(1_000),
          namespace: common.namespace,
          environment: common.environment,
        } satisfies ITodoAppFeatureFlag.IRequest,
      },
    );
  typia.assert(pageFuture);
  TestValidator.equals(
    "start_from after now: expect only 1 future flag",
    pageFuture.data.length,
    1,
  );
  const futureIds = sortIds(pageFuture.data.map((d) => d.id));
  const expectedFuture = sortIds([flagFuture.id]);
  TestValidator.equals(
    "start_from after now: id should be the future flag",
    futureIds,
    expectedFuture,
  );

  // 4-4) end_to = now => expired only
  const pageExpired =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.index(
      connection,
      {
        policyId: policy.id,
        body: {
          page: 1,
          limit: 100,
          end_to: now.toISOString(),
          namespace: common.namespace,
          environment: common.environment,
        } satisfies ITodoAppFeatureFlag.IRequest,
      },
    );
  typia.assert(pageExpired);
  TestValidator.equals(
    "end_to now: expect only 1 expired flag",
    pageExpired.data.length,
    1,
  );
  const expiredIds = sortIds(pageExpired.data.map((d) => d.id));
  const expectedExpired = sortIds([flagExpired.id]);
  TestValidator.equals(
    "end_to now: id should be the expired flag",
    expiredIds,
    expectedExpired,
  );
}
