import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Ensure uniqueness conflict on policy code update does not mutate data.
 *
 * Scenario overview:
 *
 * - Authenticate as systemAdmin
 * - Create Policy A (codeA)
 * - Create Policy B (codeB)
 * - Try to update Policy B's code to codeA (should fail with
 *   validation/uniqueness error)
 * - Perform a valid update to Policy B (change name) and verify code is still
 *   codeB
 *
 * Why necessary:
 *
 * - Service policy code is globally unique. Attempting to duplicate must fail and
 *   must not partially persist any mutation.
 * - Confirms admin-context operations function and uniqueness rules are enforced.
 *
 * Steps:
 *
 * 1. Join as systemAdmin
 * 2. Create two policies with distinct codes
 * 3. Attempt duplicate-code update on Policy B
 * 4. Verify no data mutation by updating a different field and confirming code
 *    remains unchanged
 */
export async function test_api_service_policy_update_code_uniqueness_conflict(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // Helpers for codes
  const codeA: string = `CODE_${RandomGenerator.alphaNumeric(8).toUpperCase()}`;
  const codeB: string = `CODE_${RandomGenerator.alphaNumeric(8).toUpperCase()}`;

  // 2) Create Policy A
  const policyA: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: {
          namespace: "security",
          code: codeA,
          name: RandomGenerator.name(3),
          description: RandomGenerator.paragraph({ sentences: 6 }),
          value: RandomGenerator.paragraph({ sentences: 8 }),
          value_type: "string",
          active: true,
        } satisfies ITodoAppServicePolicy.ICreate,
      },
    );
  typia.assert(policyA);

  // 3) Create Policy B
  const policyB: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: {
          namespace: "security",
          code: codeB,
          name: RandomGenerator.name(2),
          description: RandomGenerator.paragraph({ sentences: 4 }),
          value: RandomGenerator.paragraph({ sentences: 6 }),
          value_type: "string",
          active: true,
        } satisfies ITodoAppServicePolicy.ICreate,
      },
    );
  typia.assert(policyB);

  // Sanity check: distinct codes at creation
  await TestValidator.predicate(
    "policy A and B must have distinct codes at creation",
    async () => policyA.code !== policyB.code,
  );

  // 4) Attempt to update Policy B's code to codeA (should fail)
  await TestValidator.error(
    "updating policy B code to duplicate codeA must fail",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.update(
        connection,
        {
          policyId: policyB.id,
          body: {
            code: codeA,
          } satisfies ITodoAppServicePolicy.IUpdate,
        },
      );
    },
  );

  // 5) Verify no mutation: perform a successful update on a different field and confirm code unchanged
  const newName: string = RandomGenerator.name(3);
  const updatedB: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.update(
      connection,
      {
        policyId: policyB.id,
        body: {
          name: newName,
        } satisfies ITodoAppServicePolicy.IUpdate,
      },
    );
  typia.assert(updatedB);

  TestValidator.equals(
    "updated B id must remain the same",
    updatedB.id,
    policyB.id,
  );
  TestValidator.equals(
    "updated B code must remain original (no partial persistence on failed duplicate)",
    updatedB.code,
    codeB,
  );
  TestValidator.equals(
    "updated B name must reflect the successful update",
    updatedB.name,
    newName,
  );

  // Optional: validate A still has its original code (local object)
  TestValidator.equals(
    "policy A code remains as initially created",
    policyA.code,
    codeA,
  );
}
