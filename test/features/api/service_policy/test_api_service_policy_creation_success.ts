import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Validate successful creation of a service policy by a system administrator.
 *
 * Context and Purpose:
 *
 * - Only authenticated system admins may create service policies that govern
 *   application behavior.
 * - This test covers the happy path of creating a policy with a unique code and a
 *   coherent effectivity window.
 *
 * Steps:
 *
 * 1. Authenticate as systemAdmin using join endpoint (SDK injects token
 *    automatically).
 * 2. Prepare a valid ITodoAppServicePolicy.ICreate payload with active=true and
 *    effective_from < effective_to.
 * 3. POST to /todoApp/systemAdmin/servicePolicies to create the policy.
 * 4. Validate returned object type and that key fields match the input.
 * 5. Attempt duplicate creation with the same code to verify uniqueness
 *    enforcement (expect error).
 */
export async function test_api_service_policy_creation_success(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const authorized: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: adminJoinBody,
    });
  typia.assert(authorized);

  // 2) Prepare creation payload with coherent effectivity window
  const now = new Date();
  const effectiveFrom = now.toISOString();
  const effectiveTo = new Date(now.getTime() + 60 * 60 * 1000).toISOString(); // +1 hour

  const namespace = "security";
  const uniqueCode = `policy_${RandomGenerator.alphaNumeric(16)}`;
  const name = RandomGenerator.paragraph({ sentences: 3 });
  const description = RandomGenerator.content({ paragraphs: 1 });
  const value = RandomGenerator.paragraph({ sentences: 4 });
  const valueType = "string";

  const createBody = {
    namespace,
    code: uniqueCode,
    name,
    description,
    value,
    value_type: valueType,
    active: true,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
  } satisfies ITodoAppServicePolicy.ICreate;

  // 3) Create service policy
  const created: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: createBody },
    );
  typia.assert(created);

  // 4) Validate business fields match input
  TestValidator.equals(
    "namespace should match input",
    created.namespace,
    namespace,
  );
  TestValidator.equals("code should match input", created.code, uniqueCode);
  TestValidator.equals("name should match input", created.name, name);
  TestValidator.equals(
    "description should match input",
    created.description,
    description,
  );
  TestValidator.equals("value should match input", created.value, value);
  TestValidator.equals(
    "value_type should match input",
    created.value_type,
    valueType,
  );
  TestValidator.equals("active should be true", created.active, true);
  TestValidator.equals(
    "effective_from should match input",
    created.effective_from,
    effectiveFrom,
  );
  TestValidator.equals(
    "effective_to should match input",
    created.effective_to,
    effectiveTo,
  );

  // 5) Uniqueness validation: duplicate code must be rejected
  await TestValidator.error(
    "creating a policy with duplicate code should fail",
    async () => {
      const duplicateBody = {
        namespace,
        code: uniqueCode, // same code to trigger uniqueness violation
        name: RandomGenerator.paragraph({ sentences: 2 }),
        description: RandomGenerator.content({ paragraphs: 1 }),
        value: RandomGenerator.paragraph({ sentences: 3 }),
        value_type: valueType,
        active: true,
        effective_from: effectiveFrom,
        effective_to: effectiveTo,
      } satisfies ITodoAppServicePolicy.ICreate;

      await api.functional.todoApp.systemAdmin.servicePolicies.create(
        connection,
        { body: duplicateBody },
      );
    },
  );
}
