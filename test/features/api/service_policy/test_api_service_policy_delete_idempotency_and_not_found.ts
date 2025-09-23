import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Validate idempotent deletion and not-found behavior for service policies.
 *
 * Business flow:
 *
 * 1. Join as systemAdmin (authorized context established by SDK).
 * 2. Create a new service policy (unique code to avoid collisions).
 * 3. Delete the policy once (must succeed without error).
 * 4. Delete the same policy again (either succeeds idempotently or yields
 *    not-found) — both acceptable.
 * 5. Attempt deletion with a random non-existent UUID (must error at runtime).
 */
export async function test_api_service_policy_delete_idempotency_and_not_found(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: typia.random<ITodoAppSystemAdminJoin.ICreate>(),
    });
  typia.assert(adminAuth);

  // 2) Create a policy with a unique code
  const createBody = {
    namespace: "security",
    code: `policy_${RandomGenerator.alphaNumeric(16)}`,
    name: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.paragraph({ sentences: 8 }),
    value: "true",
    value_type: "boolean",
    active: true,
    effective_from: null,
    effective_to: null,
  } satisfies ITodoAppServicePolicy.ICreate;

  const policy: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: createBody },
    );
  typia.assert(policy);

  // 3) First deletion — must succeed
  await api.functional.todoApp.systemAdmin.servicePolicies.erase(connection, {
    policyId: policy.id,
  });

  // 4) Second deletion of the same id — system may respond with idempotent success or not-found.
  //    Accept either outcome without checking status codes.
  try {
    await api.functional.todoApp.systemAdmin.servicePolicies.erase(connection, {
      policyId: policy.id,
    });
  } catch (_err) {
    // Not-found after logical deletion is acceptable. No status/message inspection.
  }

  // 5) Deleting a non-existent UUID must fail (runtime error)
  await TestValidator.error(
    "deleting non-existent policy should fail",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.erase(
        connection,
        { policyId: typia.random<string & tags.Format<"uuid">>() },
      );
    },
  );
}
