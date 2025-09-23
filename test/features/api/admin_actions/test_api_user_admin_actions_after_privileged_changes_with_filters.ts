import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { EConfigValueType } from "@ORGANIZATION/PROJECT-api/lib/structures/EConfigValueType";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppAdminAction } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppAdminAction";
import type { ITodoAppAdminAction } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAdminAction";
import type { ITodoAppFeatureFlag } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppFeatureFlag";
import type { ITodoAppServiceConfiguration } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServiceConfiguration";
import type { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Audit privileged changes and list administrative actions with filters.
 *
 * This E2E validates that a system administrator can:
 *
 * 1. Join and become authenticated
 * 2. Perform privileged mutations that seed admin action history
 *
 *    - Create/Update/Delete a Service Configuration under a Service Policy
 *    - Create/Update/Delete a Feature Flag
 * 3. List administrative actions filtered by the acting admin, within a time
 *    window, ordered by created_at DESC, with pagination
 * 4. Validate that returned entries belong to the acting admin and are sorted
 *    properly
 * 5. Validate that future time windows return empty results
 */
export async function test_api_user_admin_actions_after_privileged_changes_with_filters(
  connection: api.IConnection,
) {
  // 1) Join as a new systemAdmin (SDK automatically stores token)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, { body: joinBody });
  typia.assert(admin);

  // 2) Seed audit history via privileged operations
  // 2-1) Create a service policy
  const valueTypes = [
    "string",
    "int",
    "double",
    "boolean",
    "datetime",
    "uri",
  ] as const; // aligns with EConfigValueType literals
  const policyBody = {
    namespace: `core-${RandomGenerator.alphaNumeric(6)}`,
    code: `policy_${RandomGenerator.alphaNumeric(8)}`,
    name: RandomGenerator.name(2),
    description: RandomGenerator.paragraph({ sentences: 8 }),
    value: RandomGenerator.paragraph({ sentences: 6 }),
    value_type: RandomGenerator.pick(valueTypes),
    active: true,
    effective_from: new Date().toISOString(),
    effective_to: null,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBody },
    );
  typia.assert(policy);

  // 2-2) Create service configuration under the policy
  const environments = ["dev", "staging", "prod"] as const;
  const configCreateBody = {
    // API path binds the policy; FK in body may be omitted or null
    todo_app_service_policy_id: null,
    namespace: `core-${RandomGenerator.alphaNumeric(5)}`,
    environment: RandomGenerator.pick(environments),
    key: `key_${RandomGenerator.alphaNumeric(6)}`,
    value: `${RandomGenerator.alphaNumeric(2)}`,
    value_type: RandomGenerator.pick(valueTypes),
    is_secret: false,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    active: true,
    effective_from: new Date().toISOString(),
    effective_to: null,
  } satisfies ITodoAppServiceConfiguration.ICreate;
  const configuration: ITodoAppServiceConfiguration =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.create(
      connection,
      { policyId: policy.id, body: configCreateBody },
    );
  typia.assert(configuration);

  // 2-3) Update the configuration
  const configUpdateBody = {
    value: `${RandomGenerator.alphaNumeric(2)}_${RandomGenerator.alphaNumeric(2)}`,
    description: RandomGenerator.paragraph({ sentences: 5 }),
    active: true,
  } satisfies ITodoAppServiceConfiguration.IUpdate;
  const configurationUpdated: ITodoAppServiceConfiguration =
    await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.update(
      connection,
      {
        policyId: policy.id,
        configurationId: configuration.id,
        body: configUpdateBody,
      },
    );
  typia.assert(configurationUpdated);

  // 2-4) Delete (soft-remove) the configuration
  await api.functional.todoApp.systemAdmin.servicePolicies.serviceConfigurations.erase(
    connection,
    { policyId: policy.id, configurationId: configuration.id },
  );

  // 2-5) Create a feature flag under the policy
  const featureCreateBody = {
    namespace: `ui-${RandomGenerator.alphaNumeric(4)}`,
    environment: RandomGenerator.pick(environments),
    code: `flag_${RandomGenerator.alphaNumeric(8)}`,
    name: `Feature ${RandomGenerator.name(1)}`,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    active: true,
    rollout_percentage: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
    >(),
    target_audience: RandomGenerator.paragraph({ sentences: 6 }),
    start_at: new Date().toISOString(),
    end_at: null,
    todo_app_service_policy_id: null,
  } satisfies ITodoAppFeatureFlag.ICreate;
  const featureFlag: ITodoAppFeatureFlag =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
      connection,
      { policyId: policy.id, body: featureCreateBody },
    );
  typia.assert(featureFlag);

  // 2-6) Update the feature flag
  const featureUpdateBody = {
    name: `Updated ${featureFlag.name}`,
    active: RandomGenerator.pick([true, false] as const),
    rollout_percentage: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
    >(),
    description: RandomGenerator.paragraph({ sentences: 5 }),
  } satisfies ITodoAppFeatureFlag.IUpdate;
  const featureFlagUpdated: ITodoAppFeatureFlag =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.update(
      connection,
      {
        policyId: policy.id,
        featureFlagId: featureFlag.id,
        body: featureUpdateBody,
      },
    );
  typia.assert(featureFlagUpdated);

  // 2-7) Delete (soft-remove) the feature flag
  await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.erase(
    connection,
    { policyId: policy.id, featureFlagId: featureFlag.id },
  );

  // 3) Query administrative actions with filters (recent window, admin scoped)
  const now = Date.now();
  const from = new Date(now - 10 * 60 * 1000).toISOString(); // 10 minutes ago
  const to = new Date(now + 10 * 60 * 1000).toISOString(); // 10 minutes ahead buffer

  const page1: IPageITodoAppAdminAction =
    await api.functional.todoApp.systemAdmin.users.adminActions.index(
      connection,
      {
        userId: admin.id,
        body: {
          page: 1,
          limit: 20,
          orderBy: "created_at",
          orderDirection: "desc",
          admin_user_id: admin.id,
          created_at_from: from,
          created_at_to: to,
          success: true,
        } satisfies ITodoAppAdminAction.IRequest,
      },
    );
  typia.assert(page1);

  // 4) Validations: actor, success, order
  TestValidator.predicate(
    "page1 data are sorted by created_at descending",
    page1.data.every(
      (v, i, arr) => i === 0 || arr[i - 1].created_at >= v.created_at,
    ),
  );
  TestValidator.predicate(
    "page1 data (if any) belong to the acting admin",
    page1.data.every((row) => row.admin_user_id === admin.id),
  );
  TestValidator.predicate(
    "page1 data (if any) reflect success=true filter",
    page1.data.every((row) => row.success === true),
  );

  // Pagination distinctness check with page=2
  const page2: IPageITodoAppAdminAction =
    await api.functional.todoApp.systemAdmin.users.adminActions.index(
      connection,
      {
        userId: admin.id,
        body: {
          page: 2,
          limit: 20,
          orderBy: "created_at",
          orderDirection: "desc",
          admin_user_id: admin.id,
          created_at_from: from,
          created_at_to: to,
          success: true,
        } satisfies ITodoAppAdminAction.IRequest,
      },
    );
  typia.assert(page2);

  const page1Ids = new Set(page1.data.map((d) => d.id));
  const hasOverlap = page2.data.some((d) => page1Ids.has(d.id));
  TestValidator.predicate("page1 and page2 should not overlap", !hasOverlap);

  // 5) Edge: future window should return empty results
  const futureFrom = new Date(now + 24 * 60 * 60 * 1000).toISOString();
  const futureTo = new Date(now + 48 * 60 * 60 * 1000).toISOString();
  const futurePage: IPageITodoAppAdminAction =
    await api.functional.todoApp.systemAdmin.users.adminActions.index(
      connection,
      {
        userId: admin.id,
        body: {
          page: 1,
          limit: 10,
          orderBy: "created_at",
          orderDirection: "desc",
          admin_user_id: admin.id,
          created_at_from: futureFrom,
          created_at_to: futureTo,
          success: true,
        } satisfies ITodoAppAdminAction.IRequest,
      },
    );
  typia.assert(futurePage);
  TestValidator.equals(
    "future time window produces empty result set",
    futurePage.data.length,
    0,
  );
}
