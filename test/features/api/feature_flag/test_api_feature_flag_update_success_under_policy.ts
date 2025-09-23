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
 * Update a Feature Flag under its parent Service Policy (success path).
 *
 * Steps:
 *
 * 1. SystemAdmin joins (auth handled by SDK)
 * 2. Create a Service Policy → policyId
 * 3. Create a Feature Flag under the policy → featureFlagId
 * 4. Update the Feature Flag with valid changes (name/description/active=false/
 *    rollout_percentage and window adjustments)
 * 5. Validate response fields and timestamps
 * 6. GET the flag to confirm persisted changes and policy association
 */
export async function test_api_feature_flag_update_success_under_policy(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: adminJoinBody,
  });
  typia.assert(admin);

  // 2) Create parent Service Policy
  const now = new Date();
  const policyCreateBody = {
    namespace: "feature",
    code: `policy_${RandomGenerator.alphaNumeric(10)}`,
    name: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.content({ paragraphs: 1 }),
    value: "true",
    value_type: "boolean",
    active: true,
    effective_from: now.toISOString(),
    effective_to: new Date(
      now.getTime() + 1000 * 60 * 60 * 24 * 30,
    ).toISOString(),
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: policyCreateBody,
      },
    );
  typia.assert(policy);

  // 3) Create initial Feature Flag under policy
  const startAt = new Date(now.getTime() + 1000 * 60 * 60).toISOString(); // +1h
  const endAt = new Date(now.getTime() + 1000 * 60 * 60 * 24).toISOString(); // +24h
  const flagCreateBody = {
    namespace: RandomGenerator.alphabets(6),
    environment: RandomGenerator.pick(["dev", "staging", "prod"] as const),
    code: `feat_${RandomGenerator.alphaNumeric(8)}`,
    name: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.content({ paragraphs: 1 }),
    active: true,
    rollout_percentage: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
    >(),
    target_audience: RandomGenerator.paragraph({ sentences: 6 }),
    start_at: startAt,
    end_at: endAt,
  } satisfies ITodoAppFeatureFlag.ICreate;
  const created: ITodoAppFeatureFlag =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.create(
      connection,
      {
        policyId: policy.id,
        body: flagCreateBody,
      },
    );
  typia.assert(created);

  // 4) Update the Feature Flag (valid changes, preserve policy association)
  const updateStartAt = new Date(
    now.getTime() + 1000 * 60 * 60 * 2,
  ).toISOString(); // +2h
  const updateEndAt = new Date(
    now.getTime() + 1000 * 60 * 60 * 48,
  ).toISOString(); // +48h
  const updatedBody = {
    name: RandomGenerator.paragraph({ sentences: 4 }),
    description: RandomGenerator.content({ paragraphs: 1 }),
    active: false,
    rollout_percentage: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
    >(),
    target_audience: RandomGenerator.paragraph({ sentences: 5 }),
    environment: RandomGenerator.pick(["dev", "staging", "prod"] as const),
    start_at: updateStartAt,
    end_at: updateEndAt,
    // DO NOT set todo_app_service_policy_id in policy-scoped update
  } satisfies ITodoAppFeatureFlag.IUpdate;
  const updated: ITodoAppFeatureFlag =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.update(
      connection,
      {
        policyId: policy.id,
        featureFlagId: created.id,
        body: updatedBody,
      },
    );
  typia.assert(updated);

  // 5) Validate update response
  TestValidator.equals("updated id equals created id", updated.id, created.id);
  TestValidator.equals(
    "policy association preserved on update",
    updated.todo_app_service_policy_id,
    policy.id,
  );
  TestValidator.equals("active flipped to false", updated.active, false);
  TestValidator.equals("name updated", updated.name, updatedBody.name);
  TestValidator.equals(
    "description updated",
    updated.description,
    updatedBody.description,
  );
  TestValidator.equals(
    "rollout percentage updated",
    updated.rollout_percentage,
    updatedBody.rollout_percentage,
  );
  TestValidator.equals(
    "environment updated",
    updated.environment,
    updatedBody.environment,
  );
  TestValidator.equals(
    "start_at updated",
    updated.start_at,
    updatedBody.start_at,
  );
  TestValidator.equals("end_at updated", updated.end_at, updatedBody.end_at);
  TestValidator.equals(
    "created_at preserved",
    updated.created_at,
    created.created_at,
  );
  TestValidator.notEquals(
    "updated_at changed",
    updated.updated_at,
    created.updated_at,
  );

  // 6) GET to confirm persisted changes
  const fetched: ITodoAppFeatureFlag =
    await api.functional.todoApp.systemAdmin.servicePolicies.featureFlags.at(
      connection,
      {
        policyId: policy.id,
        featureFlagId: created.id,
      },
    );
  typia.assert(fetched);

  TestValidator.equals("fetched id equals created id", fetched.id, created.id);
  TestValidator.equals(
    "fetched matches updated: policy association",
    fetched.todo_app_service_policy_id,
    policy.id,
  );
  TestValidator.equals(
    "fetched matches updated: active",
    fetched.active,
    updatedBody.active,
  );
  TestValidator.equals(
    "fetched matches updated: name",
    fetched.name,
    updatedBody.name,
  );
  TestValidator.equals(
    "fetched matches updated: description",
    fetched.description,
    updatedBody.description,
  );
  TestValidator.equals(
    "fetched matches updated: rollout_percentage",
    fetched.rollout_percentage,
    updatedBody.rollout_percentage,
  );
  TestValidator.equals(
    "fetched matches updated: environment",
    fetched.environment,
    updatedBody.environment,
  );
  TestValidator.equals(
    "fetched matches updated: start_at",
    fetched.start_at,
    updatedBody.start_at,
  );
  TestValidator.equals(
    "fetched matches updated: end_at",
    fetched.end_at,
    updatedBody.end_at,
  );
  TestValidator.equals(
    "fetched created_at preserved",
    fetched.created_at,
    created.created_at,
  );
}
