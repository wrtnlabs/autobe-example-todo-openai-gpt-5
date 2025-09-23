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
 * Validate idempotent deletion of a Feature Flag.
 *
 * Business flow:
 *
 * 1. Join as systemAdmin (authentication token is managed by SDK)
 * 2. Create a Service Policy
 * 3. Create a Feature Flag linked to the created policy
 * 4. DELETE the feature flag once (must succeed)
 * 5. DELETE the same feature flag again
 *
 *    - Accept both behaviors: success (idempotent) or HttpError (e.g., not-found)
 *
 * Notes:
 *
 * - Do not assert specific HTTP status codes.
 * - Use exact ICreate DTO variants for POST bodies.
 */
export async function test_api_feature_flag_delete_idempotent(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
      // optional contextual values left undefined on purpose
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert<ITodoAppSystemAdmin.IAuthorized>(admin);

  // 2) Create a Service Policy
  const policy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: {
          namespace: "feature",
          code: `policy_${RandomGenerator.alphaNumeric(12)}`,
          name: RandomGenerator.paragraph({ sentences: 2 }),
          description: RandomGenerator.paragraph({ sentences: 6 }),
          value: "true",
          value_type: "boolean",
          active: true,
          effective_from: null,
          effective_to: null,
        } satisfies ITodoAppServicePolicy.ICreate,
      },
    );
  typia.assert<ITodoAppServicePolicy>(policy);

  // 3) Create a Feature Flag linked to the policy
  const environments = ["dev", "staging", "prod"] as const;
  const featureFlag =
    await api.functional.todoApp.systemAdmin.featureFlags.create(connection, {
      body: {
        namespace: "ui",
        environment: RandomGenerator.pick(environments),
        code: `flag_${RandomGenerator.alphaNumeric(12)}`,
        name: RandomGenerator.paragraph({ sentences: 2 }),
        description: RandomGenerator.paragraph({ sentences: 8 }),
        active: true,
        rollout_percentage: typia.random<
          number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
        >(),
        target_audience: RandomGenerator.paragraph({ sentences: 4 }),
        start_at: null,
        end_at: null,
        todo_app_service_policy_id: policy.id,
      } satisfies ITodoAppFeatureFlag.ICreate,
    });
  typia.assert<ITodoAppFeatureFlag>(featureFlag);

  // 4) First DELETE - must succeed
  await api.functional.todoApp.systemAdmin.featureFlags.erase(connection, {
    featureFlagId: featureFlag.id,
  });

  // 5) Second DELETE - accept idempotent semantics (success or not-found)
  try {
    await api.functional.todoApp.systemAdmin.featureFlags.erase(connection, {
      featureFlagId: featureFlag.id,
    });
  } catch (exp) {
    // Accept provider behavior that returns HttpError (e.g., not-found) after first deletion
    if (!(exp instanceof api.HttpError)) throw exp;
  }

  TestValidator.predicate(
    "second delete completed with idempotent semantics (success or not-found)",
    true,
  );
}
