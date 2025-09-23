import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppFeatureFlag } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppFeatureFlag";
import type { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Verify that GET feature flag detail is protected by admin authorization.
 *
 * Business flow:
 *
 * 1. Register a system admin (authorized context automatically applied to
 *    connection)
 * 2. Create a parent service policy
 * 3. Create a feature flag scoped under the policy
 * 4. Sanity check: read the flag with authorized connection (should succeed)
 * 5. Attempt to read the same flag with an unauthenticated connection (should
 *    fail)
 *
 * Validations:
 *
 * - Typia.assert() for all successful responses
 * - Use TestValidator.error(...) for unauthorized access (no status code checks)
 */
export async function test_api_feature_flag_detail_unauthorized_access(
  connection: api.IConnection,
) {
  // 1) Register a system admin (authorization token applied by SDK)
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 2) Create a parent service policy
  const policyBody = {
    namespace: `auth_${RandomGenerator.alphaNumeric(6)}`,
    code: `POL_${RandomGenerator.alphaNumeric(8)}`,
    name: RandomGenerator.name(2),
    description: RandomGenerator.paragraph({ sentences: 6 }),
    value: "true",
    value_type: "boolean",
    active: true,
  } satisfies ITodoAppServicePolicy.ICreate;

  const policy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBody },
    );
  typia.assert(policy);

  // 3) Create a feature flag under the policy
  const envs = ["dev", "staging", "prod"] as const;
  const featureFlagBody = {
    namespace: `ui_${RandomGenerator.alphaNumeric(6)}`,
    environment: RandomGenerator.pick(envs),
    code: `FF_${RandomGenerator.alphaNumeric(10)}`,
    name: RandomGenerator.name(2),
    description: RandomGenerator.paragraph({ sentences: 5 }),
    active: true,
    rollout_percentage: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
    >(),
  } satisfies ITodoAppFeatureFlag.ICreate;

  const flag =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
      connection,
      {
        policyId: policy.id,
        body: featureFlagBody,
      },
    );
  typia.assert(flag);

  // 4) Sanity check: authorized read should succeed
  const readAuthorized =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.at(
      connection,
      { policyId: policy.id, featureFlagId: flag.id },
    );
  typia.assert(readAuthorized);
  TestValidator.equals(
    "authorized read returns the same feature flag id",
    readAuthorized.id,
    flag.id,
  );

  // 5) Unauthorized read attempt using a clean connection (no headers)
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthorized GET of feature flag detail should be rejected",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.at(
        unauthConn,
        { policyId: policy.id, featureFlagId: flag.id },
      );
    },
  );
}
