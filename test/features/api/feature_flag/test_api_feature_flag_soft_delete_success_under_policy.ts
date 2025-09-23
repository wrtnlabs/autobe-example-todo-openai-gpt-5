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
 * Verify soft-deletion of a Feature Flag under a Service Policy and its
 * idempotency.
 *
 * Steps:
 *
 * 1. Admin joins to obtain an authenticated session
 * 2. Create a parent Service Policy (policyId)
 * 3. Create a Feature Flag (featureFlagId) under the policy
 * 4. (Sanity check) GET the flag before deletion and verify id consistency
 * 5. DELETE the flag (soft-delete)
 * 6. GET after deletion should fail (error)
 * 7. DELETE again should succeed (idempotent)
 * 8. PATCH index (list) should exclude the deleted flag when filtered by code
 */
export async function test_api_feature_flag_soft_delete_success_under_policy(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 2) Create parent Service Policy
  const createPolicyBody = {
    namespace: `feature-mgmt`,
    code: `pol-${RandomGenerator.alphaNumeric(12)}`,
    name: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.content({ paragraphs: 1 }),
    value: "true",
    value_type: "boolean",
    active: true,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: createPolicyBody },
    );
  typia.assert(policy);

  // 3) Create a Feature Flag under the policy
  const createFlagBody = {
    namespace: "ui",
    environment: "dev",
    code: `flag-${RandomGenerator.alphaNumeric(10)}`,
    name: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.content({ paragraphs: 1 }),
    active: true,
    rollout_percentage: 50,
    target_audience: RandomGenerator.paragraph({ sentences: 5 }),
  } satisfies ITodoAppFeatureFlag.ICreate;
  const flag =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
      connection,
      {
        policyId: policy.id,
        body: createFlagBody,
      },
    );
  typia.assert(flag);

  // 4) Sanity check: GET before deletion and verify id consistency
  const preDel =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.at(
      connection,
      { policyId: policy.id, featureFlagId: flag.id },
    );
  typia.assert(preDel);
  TestValidator.equals(
    "pre-delete GET returns the same feature flag id",
    preDel.id,
    flag.id,
  );

  // 5) Soft-delete the feature flag
  await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.erase(
    connection,
    { policyId: policy.id, featureFlagId: flag.id },
  );

  // 6) After deletion, GET must fail
  await TestValidator.error("GET after soft-delete should fail", async () => {
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.at(
      connection,
      { policyId: policy.id, featureFlagId: flag.id },
    );
  });

  // 7) Idempotency: Deleting again should also succeed
  await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.erase(
    connection,
    { policyId: policy.id, featureFlagId: flag.id },
  );

  // 8) Listing should exclude the deleted flag (filter by exact code)
  const listBody = {
    code: flag.code,
  } satisfies ITodoAppFeatureFlag.IRequest;
  const page =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.index(
      connection,
      { policyId: policy.id, body: listBody },
    );
  typia.assert(page);
  TestValidator.predicate(
    "listed flags should not contain the deleted id",
    page.data.find((f) => f.id === flag.id) === undefined,
  );
}
