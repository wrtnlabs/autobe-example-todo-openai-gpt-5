import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

export async function test_api_service_policy_update_success(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: adminJoinBody,
    });
  typia.assert(adminAuth);

  // 2) Create a baseline service policy
  const baseCode = `policy_${RandomGenerator.alphaNumeric(10)}`;
  const createBody = {
    namespace: "auth",
    code: baseCode,
    name: RandomGenerator.paragraph({ sentences: 3 }),
    description: null,
    value: "enabled",
    value_type: "string",
    active: true,
    effective_from: null,
    effective_to: null,
  } satisfies ITodoAppServicePolicy.ICreate;
  const created: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: createBody },
    );
  typia.assert(created);

  // Prepare coherent effectivity window: now+1h to now+2h
  const now = new Date();
  const fromIso = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const toIso = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();

  // 3) Update mutable fields of the policy (keep code and namespace unchanged)
  const updateBody = {
    name: RandomGenerator.paragraph({ sentences: 4 }),
    description: RandomGenerator.paragraph({ sentences: 8 }),
    active: false,
    value: "123",
    value_type: "int",
    effective_from: fromIso,
    effective_to: toIso,
  } satisfies ITodoAppServicePolicy.IUpdate;
  const updated: ITodoAppServicePolicy =
    await api.functional.todoApp.systemAdmin.servicePolicies.update(
      connection,
      {
        policyId: created.id,
        body: updateBody,
      },
    );
  typia.assert(updated);

  // Business validations
  TestValidator.equals("policy id unchanged", updated.id, created.id);
  TestValidator.equals("policy code preserved", updated.code, created.code);
  TestValidator.equals(
    "policy namespace preserved",
    updated.namespace,
    created.namespace,
  );
  TestValidator.notEquals(
    "updated_at should change after update",
    updated.updated_at,
    created.updated_at,
  );

  // Updated fields reflect request body
  TestValidator.equals("name updated", updated.name, updateBody.name!);
  TestValidator.equals(
    "description updated",
    updated.description ?? null,
    updateBody.description ?? null,
  );
  TestValidator.equals("active toggled", updated.active, updateBody.active!);
  TestValidator.equals("value updated", updated.value, updateBody.value!);
  TestValidator.equals(
    "value_type updated",
    updated.value_type,
    updateBody.value_type!,
  );

  // Validate effectivity window was set and is coherent
  const effFrom = typia.assert<string & tags.Format<"date-time">>(
    updated.effective_from!,
  );
  const effTo = typia.assert<string & tags.Format<"date-time">>(
    updated.effective_to!,
  );
  TestValidator.equals(
    "effective_from updated",
    effFrom,
    updateBody.effective_from!,
  );
  TestValidator.equals("effective_to updated", effTo, updateBody.effective_to!);
  TestValidator.predicate(
    "effective_from is earlier than effective_to",
    new Date(effFrom).getTime() < new Date(effTo).getTime(),
  );
}
