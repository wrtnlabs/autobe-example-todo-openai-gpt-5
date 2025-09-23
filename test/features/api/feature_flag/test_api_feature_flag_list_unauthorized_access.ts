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
 * Ensure unauthorized clients cannot list feature flags under a policy.
 *
 * Business flow:
 *
 * 1. Register a system admin (authorized context is set by SDK automatically).
 * 2. Create a parent service policy.
 * 3. Create a feature flag under that policy.
 * 4. Verify authorized listing (filter by exact code) returns the created flag.
 * 5. Attempt the same listing with an unauthenticated connection and expect an
 *    error.
 *
 * Assertions:
 *
 * - Typia.assert on every successful API response (admin join, policy, flag,
 *   listing page).
 * - Authorized listing: at least one record and the created flag id appears when
 *   filtering by code.
 * - Unauthenticated listing: throws an error; do not validate status codes.
 */
export async function test_api_feature_flag_list_unauthorized_access(
  connection: api.IConnection,
) {
  // 1) Admin join (authorized context)
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 2) Create a parent service policy
  const policy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: {
          namespace: `auth-${RandomGenerator.alphaNumeric(6)}`,
          code: `policy-${RandomGenerator.alphaNumeric(8)}`,
          name: RandomGenerator.paragraph({ sentences: 3 }),
          description: RandomGenerator.paragraph({ sentences: 6 }),
          value: RandomGenerator.paragraph({ sentences: 5 }),
          value_type: "string",
          active: true,
        } satisfies ITodoAppServicePolicy.ICreate,
      },
    );
  typia.assert(policy);

  // 3) Create a feature flag under the policy
  const flagCode = `flag-${RandomGenerator.alphaNumeric(8)}`;
  const createdFlag =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
      connection,
      {
        policyId: policy.id,
        body: {
          namespace: `ui-${RandomGenerator.alphaNumeric(5)}`,
          environment: RandomGenerator.pick([
            "dev",
            "staging",
            "prod",
          ] as const),
          code: flagCode,
          name: RandomGenerator.paragraph({ sentences: 3 }),
          description: RandomGenerator.paragraph({ sentences: 6 }),
          active: true,
          rollout_percentage: typia.random<
            number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
          >(),
          target_audience: RandomGenerator.paragraph({ sentences: 4 }),
          start_at: new Date().toISOString(),
          end_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        } satisfies ITodoAppFeatureFlag.ICreate,
      },
    );
  typia.assert(createdFlag);

  // 4) Authorized listing with an exact code filter
  const pageAuthorized =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.index(
      connection,
      {
        policyId: policy.id,
        body: {
          page: 1,
          limit: 10,
          code: flagCode,
        } satisfies ITodoAppFeatureFlag.IRequest,
      },
    );
  typia.assert(pageAuthorized);

  TestValidator.predicate(
    "authorized listing returns at least one record",
    pageAuthorized.data.length >= 1,
  );

  const found = pageAuthorized.data.find((s) => s.id === createdFlag.id);
  TestValidator.predicate(
    "created flag id should appear in authorized listing when filtering by code",
    () => found !== undefined,
  );

  // 5) Unauthenticated listing must be denied
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated listing attempt is rejected",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.index(
        unauthConn,
        {
          policyId: policy.id,
          body: {
            page: 1,
            limit: 10,
            code: flagCode,
          } satisfies ITodoAppFeatureFlag.IRequest,
        },
      );
    },
  );
}
