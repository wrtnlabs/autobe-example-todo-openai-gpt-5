import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

export async function test_api_service_policy_delete_success_and_effect(
  connection: api.IConnection,
) {
  /**
   * Validate soft-delete behavior for service policies:
   *
   * 1. Join as systemAdmin
   * 2. Create two policies (A and B)
   * 3. Verify both are readable
   * 4. Delete policy A
   * 5. Verify A becomes non-retrievable while B remains accessible
   */
  // 1) Authenticate (join) as system admin
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12), // 8~64 chars
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(adminAuth);

  // 2) Create two policies (A and B)
  const nowIso: string = new Date().toISOString();
  // Optional: assert date-time format for clarity
  typia.assert<string & tags.Format<"date-time">>(nowIso);

  const createBodyA = {
    namespace: "auth",
    code: `policy_${RandomGenerator.alphaNumeric(12)}`,
    name: `Auth Policy ${RandomGenerator.alphabets(6)}`,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    value: "true",
    value_type: "boolean",
    active: true,
    effective_from: nowIso,
    effective_to: null,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policyA: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: createBodyA },
    );
  typia.assert(policyA);

  const createBodyB = {
    namespace: "security",
    code: `policy_${RandomGenerator.alphaNumeric(12)}`,
    name: `Security Policy ${RandomGenerator.alphabets(6)}`,
    description: RandomGenerator.paragraph({ sentences: 4 }),
    value: "30",
    value_type: "int",
    active: true,
    effective_from: nowIso,
    effective_to: null,
  } satisfies ITodoAppServicePolicy.ICreate;
  const policyB: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: createBodyB },
    );
  typia.assert(policyB);

  // 3) Pre-deletion: verify both are fetchable
  const fetchedA: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.at(connection, {
      policyId: policyA.id,
    });
  typia.assert(fetchedA);
  TestValidator.equals(
    "pre-delete: fetchedA id should match created policyA id",
    fetchedA.id,
    policyA.id,
  );

  const fetchedB: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.at(connection, {
      policyId: policyB.id,
    });
  typia.assert(fetchedB);
  TestValidator.equals(
    "pre-delete: fetchedB id should match created policyB id",
    fetchedB.id,
    policyB.id,
  );

  // 4) Delete policy A (logical delete)
  await api.functional.todoApp.systemAdmin.servicePolicies.erase(connection, {
    policyId: policyA.id,
  });

  // 5) Post-deletion effects
  // 5-a) Deleted policy should not be readable
  await TestValidator.error(
    "post-delete: fetching deleted policyA should fail",
    async () => {
      await api.functional.todoApp.systemAdmin.servicePolicies.at(connection, {
        policyId: policyA.id,
      });
    },
  );

  // 5-b) Unrelated policy B must remain readable
  const reFetchedB: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.at(connection, {
      policyId: policyB.id,
    });
  typia.assert(reFetchedB);
  TestValidator.equals(
    "post-delete: policyB remains accessible and id matches",
    reFetchedB.id,
    policyB.id,
  );
}
