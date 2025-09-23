import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Validate duplicate code conflict on service policy creation.
 *
 * Business context: System administrators can create service policies that are
 * globally referenced by a unique "code". Creating another policy with the same
 * code must be rejected by the backend.
 *
 * Steps:
 *
 * 1. Authenticate as a system admin (join) to obtain an authorized session.
 * 2. Create Policy A with code = "POLICY_DUP_TEST".
 * 3. Attempt to create Policy B with the same code, expecting an error.
 *
 * Validations:
 *
 * - Successful creation returns an ITodoAppServicePolicy and matches the
 *   requested code.
 * - Second creation with the same code throws an error (conflict/validation).
 */
export async function test_api_service_policy_creation_duplicate_code_conflict(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // 8-64 chars
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: adminJoinBody,
    });
  typia.assert(adminAuth);

  // 2) Create Policy A with a fixed duplicate code
  const duplicateCode = "POLICY_DUP_TEST";
  const createPolicyABody = {
    namespace: "auth",
    code: duplicateCode,
    name: "Duplicate Code Test Policy A",
    description: RandomGenerator.paragraph({ sentences: 8 }),
    value: "true",
    value_type: "boolean",
    active: true,
    effective_from: new Date().toISOString(),
    effective_to: null,
  } satisfies ITodoAppServicePolicy.ICreate;

  const policyA: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: createPolicyABody,
      },
    );
  typia.assert(policyA);

  // Basic business validations on the created policy
  TestValidator.equals(
    "policy A code should match the requested code",
    policyA.code,
    duplicateCode,
  );
  TestValidator.equals("policy A should be active", policyA.active, true);

  // 3) Attempt to create Policy B with the same code - expect error
  const createPolicyBBody = {
    namespace: "auth",
    code: duplicateCode, // same code -> uniqueness violation expected
    name: "Duplicate Code Test Policy B",
    description: RandomGenerator.paragraph({ sentences: 6 }),
    value: "false",
    value_type: "boolean",
    active: true,
    effective_from: new Date().toISOString(),
    effective_to: null,
  } satisfies ITodoAppServicePolicy.ICreate;

  await TestValidator.error(
    "second policy creation with duplicate code must fail",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.create(
        connection,
        {
          body: createPolicyBBody,
        },
      );
    },
  );
}
