import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { EConfigValueType } from "@ORGANIZATION/PROJECT-api/lib/structures/EConfigValueType";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppServiceConfiguration } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServiceConfiguration";
import type { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Validate creation input enforcement for service configurations.
 *
 * This test ensures administrative creation of service configurations enforces:
 *
 * 1. Value_type must be one of supported hints (string, int, double, boolean,
 *    datetime, uri)
 * 2. Effective time window must be coherent (effective_from < effective_to when
 *    both provided)
 *
 * Flow:
 *
 * - Join as a system admin (auth token attached by SDK).
 * - Create a service policy to reference from configuration.
 * - Attempt configuration creation with unsupported value_type → expect error.
 * - Attempt configuration creation with incoherent effective window → expect
 *   error.
 */
export async function test_api_service_configuration_creation_invalid_value_type(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // 8~64 chars per policy
    // Optional contextual fields (not persisted on user directly)
    ip: undefined,
    user_agent: undefined,
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: adminJoinBody,
    });
  typia.assert(admin);

  // 2) Create a valid service policy to reference
  const policyBody = {
    namespace: `core-${RandomGenerator.alphabets(6)}`,
    code: `policy_${RandomGenerator.alphaNumeric(10)}`,
    name: RandomGenerator.paragraph({ sentences: 2 }),
    description: RandomGenerator.paragraph({ sentences: 6 }),
    value: RandomGenerator.paragraph({ sentences: 3 }),
    value_type: "string",
    active: true,
    effective_from: null,
    effective_to: null,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policy: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: policyBody,
      },
    );
  typia.assert(policy);

  // Helper: supported value types for valid scenarios
  const allowed = [
    "string",
    "int",
    "double",
    "boolean",
    "datetime",
    "uri",
  ] as const;

  // 3) Negative A: Unsupported value_type should be rejected
  const invalidTypeConfigBody = {
    todo_app_service_policy_id: policy.id,
    namespace: `core-${RandomGenerator.alphabets(5)}`,
    environment: "dev",
    key: `feature_${RandomGenerator.alphaNumeric(8)}`,
    value: RandomGenerator.paragraph({ sentences: 3 }),
    value_type: "numberx", // unsupported
    is_secret: false,
    description: RandomGenerator.paragraph({ sentences: 4 }),
    active: true,
    effective_from: null,
    effective_to: null,
  } satisfies ITodoAppServiceConfiguration.ICreate;
  await TestValidator.error(
    "reject unsupported value_type on service configuration creation",
    async () => {
      await api.functional.todoApp.systemAdmin.serviceConfigurations.create(
        connection,
        { body: invalidTypeConfigBody },
      );
    },
  );

  // 4) Negative B: Incoherent effective window should be rejected
  const now = new Date();
  const later = new Date(now.getTime() + 60 * 60 * 1000); // +1 hour
  const incoherentWindowBody = {
    todo_app_service_policy_id: policy.id,
    namespace: `core-${RandomGenerator.alphabets(5)}`,
    environment: "dev",
    key: `window_${RandomGenerator.alphaNumeric(8)}`,
    value: RandomGenerator.paragraph({ sentences: 3 }),
    value_type: RandomGenerator.pick(allowed), // valid type
    is_secret: false,
    description: RandomGenerator.paragraph({ sentences: 4 }),
    active: true,
    // Intentionally incoherent: from is later than to
    effective_from: later.toISOString(),
    effective_to: now.toISOString(),
  } satisfies ITodoAppServiceConfiguration.ICreate;
  await TestValidator.error(
    "reject incoherent effective window (effective_from >= effective_to)",
    async () => {
      await api.functional.todoApp.systemAdmin.serviceConfigurations.create(
        connection,
        { body: incoherentWindowBody },
      );
    },
  );
}
