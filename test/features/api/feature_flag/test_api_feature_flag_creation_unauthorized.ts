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
 * Verify that feature flag creation is denied without admin authentication.
 *
 * Business context:
 *
 * - Feature flags are administrative controls and require systemAdmin privileges
 *   for creation under a given service policy.
 * - The SDK automatically injects Authorization on successful admin join, so we
 *   must construct a separate unauthenticated connection when testing denial.
 *
 * Steps:
 *
 * 1. Register a system admin (join) to gain authorized context
 * 2. Create a service policy to obtain a real policyId
 * 3. Build an unauthenticated connection object
 * 4. Attempt to create a feature flag using the unauthenticated connection and
 *    expect an error (no status code pinning)
 */
export async function test_api_feature_flag_creation_unauthorized(
  connection: api.IConnection,
) {
  // 1) Admin registration (authorized context provisioning)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: joinBody,
  });
  typia.assert(admin);

  // 2) Create a service policy to obtain a real policyId
  const policyBody = {
    namespace: `auth-${RandomGenerator.alphaNumeric(6)}`,
    code: `policy-${RandomGenerator.alphaNumeric(12)}`,
    name: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.paragraph({ sentences: 8 }),
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

  // 3) Build an unauthenticated connection (do not touch after creation)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 4) Attempt unauthorized feature flag creation -> must error
  const featureFlagBody = {
    namespace: `ui-${RandomGenerator.alphaNumeric(5)}`,
    environment: RandomGenerator.pick(["dev", "staging", "prod"] as const),
    code: `ff-${RandomGenerator.alphaNumeric(12)}`,
    name: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.paragraph({ sentences: 8 }),
    active: true,
    rollout_percentage: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
    >(),
  } satisfies ITodoAppFeatureFlag.ICreate;

  await TestValidator.error(
    "unauthenticated feature flag creation must be denied",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
        unauthConn,
        {
          policyId: policy.id,
          body: featureFlagBody,
        },
      );
    },
  );
}
