import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Retrieve a specific service policy by ID after admin-authenticated creation.
 *
 * This test validates that a system administrator can:
 *
 * 1. Join (authenticate) and obtain an authorized context,
 * 2. Create a new service policy with a coherent effectivity window,
 * 3. Fetch the policy detail by its UUID, and
 * 4. Confirm that all business fields match the created entity.
 *
 * Steps
 *
 * - Admin join: POST /auth/systemAdmin/join
 * - Create policy: POST /todoApp/systemAdmin/servicePolicies
 * - Get policy: GET /todoApp/systemAdmin/servicePolicies/{policyId}
 *
 * Validations
 *
 * - Typia.assert on all responses
 * - Equality checks on id and core fields
 */
export async function test_api_service_policy_detail_success(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(adminAuth);

  // 2) Create a new service policy
  const namespaces = [
    "auth",
    "security",
    "privacy",
    "retention",
    "rate_limit",
  ] as const;
  const namespace: (typeof namespaces)[number] =
    RandomGenerator.pick(namespaces);

  const now = new Date();
  const effectiveFrom = new Date(now.getTime() + 1 * 60 * 1000).toISOString(); // now + 1m
  const effectiveTo = new Date(now.getTime() + 60 * 60 * 1000).toISOString(); // now + 1h

  const createBody = {
    namespace,
    code: `policy_${RandomGenerator.alphaNumeric(12)}`,
    name: RandomGenerator.name(3),
    description: RandomGenerator.paragraph({ sentences: 8 }),
    value: "true",
    value_type: "boolean",
    active: true,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
  } satisfies ITodoAppServicePolicy.ICreate;

  const created: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: createBody },
    );
  typia.assert(created);

  // 3) Retrieve the policy by ID
  const read: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.at(connection, {
      policyId: created.id,
    });
  typia.assert(read);

  // 4) Business validations
  TestValidator.equals("retrieved id equals created id", read.id, created.id);
  TestValidator.equals(
    "namespace matches",
    read.namespace,
    createBody.namespace,
  );
  TestValidator.equals("code matches", read.code, createBody.code);
  TestValidator.equals("name matches", read.name, createBody.name);
  TestValidator.equals(
    "description matches",
    read.description ?? null,
    createBody.description ?? null,
  );
  TestValidator.equals("value matches", read.value, createBody.value);
  TestValidator.equals(
    "value_type matches",
    read.value_type,
    createBody.value_type,
  );
  TestValidator.equals("active matches", read.active, createBody.active);
  TestValidator.equals(
    "effective_from matches",
    read.effective_from ?? null,
    createBody.effective_from ?? null,
  );
  TestValidator.equals(
    "effective_to matches",
    read.effective_to ?? null,
    createBody.effective_to ?? null,
  );

  // created_at usually remains stable; ensure consistency immediately after creation
  TestValidator.equals(
    "created_at consistent after read",
    read.created_at,
    created.created_at,
  );
}
