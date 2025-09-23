import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppServicePolicy";
import type { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * List Service Policies with basic filters and pagination.
 *
 * Business flow:
 *
 * 1. Register and authenticate a systemAdmin using join API (SDK auto-injects
 *    token).
 * 2. Seed three service policies under a unique namespace: two active=true, one
 *    active=false.
 * 3. Invoke PATCH /todoApp/systemAdmin/servicePolicies with filters
 *
 *    - Namespace = unique namespace
 *    - Active = true
 *    - Page = 1, limit = 1
 *    - Sort = created_at, direction = desc Validate: one record, correct
 *         namespace/active, and pagination meta.
 * 4. Request page=2 with the same filters, then verify it returns the second
 *    active record, entries are distinct across pages, and sort order is
 *    respected (desc by created_at).
 * 5. Negative check: filter by code of inactive policy + active=true → expect
 *    empty data array.
 */
export async function test_api_service_policy_list_basic_filters_and_pagination(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin (join)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: joinBody,
  });
  typia.assert(admin);

  // 2) Seed policies under a unique namespace
  const suffix = RandomGenerator.alphaNumeric(8);
  const NAMESPACE = `ns_${suffix}`;

  const policyBody1 = {
    namespace: NAMESPACE,
    code: `code_a_${suffix}`,
    name: `Policy A ${suffix}`,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    value: "5",
    value_type: "int",
    active: true,
  } satisfies ITodoAppServicePolicy.ICreate;
  const created1 =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBody1 },
    );
  typia.assert(created1);

  const policyBody2 = {
    namespace: NAMESPACE,
    code: `code_b_${suffix}`,
    name: `Policy B ${suffix}`,
    description: RandomGenerator.paragraph({ sentences: 5 }),
    value: "strict",
    value_type: "string",
    active: true,
  } satisfies ITodoAppServicePolicy.ICreate;
  const created2 =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBody2 },
    );
  typia.assert(created2);

  const policyBody3 = {
    namespace: NAMESPACE,
    code: `code_c_${suffix}`,
    name: `Policy C ${suffix}`,
    description: RandomGenerator.paragraph({ sentences: 4 }),
    value: "off",
    value_type: "string",
    active: false,
  } satisfies ITodoAppServicePolicy.ICreate;
  const created3 =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      { body: policyBody3 },
    );
  typia.assert(created3);

  // 3) List with filters (active=true) and pagination (page=1, limit=1)
  const listReqPage1 = {
    namespace: NAMESPACE,
    active: true,
    page: 1,
    limit: 1,
    sort: "created_at",
    direction: "desc",
  } satisfies ITodoAppServicePolicy.IRequest;
  const page1 = await api.functional.todoApp.systemAdmin.servicePolicies.index(
    connection,
    { body: listReqPage1 },
  );
  typia.assert(page1);

  // Validate page1 contents
  TestValidator.predicate(
    "page1 returns exactly one active item in the namespace",
    page1.data.length === 1 &&
      page1.data.every((p) => p.namespace === NAMESPACE && p.active === true),
  );
  TestValidator.equals(
    "pagination.limit matches request limit on page1",
    page1.pagination.limit,
    1,
  );
  TestValidator.predicate(
    "pagination.records is at least 2 for two active policies",
    page1.pagination.records >= 2,
  );
  TestValidator.predicate(
    "pagination.pages is at least 2 with limit=1",
    page1.pagination.pages >= 2,
  );

  // 4) Request page=2 with same filters
  const listReqPage2 = {
    namespace: NAMESPACE,
    active: true,
    page: 2,
    limit: 1,
    sort: "created_at",
    direction: "desc",
  } satisfies ITodoAppServicePolicy.IRequest;
  const page2 = await api.functional.todoApp.systemAdmin.servicePolicies.index(
    connection,
    { body: listReqPage2 },
  );
  typia.assert(page2);

  TestValidator.predicate(
    "page2 also returns exactly one active item in the namespace",
    page2.data.length === 1 &&
      page2.data.every((p) => p.namespace === NAMESPACE && p.active === true),
  );

  // Distinct entries across pages and sort order desc by created_at
  const first1 = page1.data[0];
  const first2 = page2.data[0];
  TestValidator.predicate(
    "page1 and page2 items are distinct",
    first1.id !== first2.id,
  );
  TestValidator.predicate(
    "created_at is sorted desc across pages",
    new Date(first1.created_at).getTime() >=
      new Date(first2.created_at).getTime(),
  );

  // Verify that returned records are from the seeded active set
  const activeCodes = [created1.code, created2.code];
  TestValidator.predicate(
    "page1 item belongs to the active seeded set",
    activeCodes.includes(first1.code),
  );
  TestValidator.predicate(
    "page2 item belongs to the active seeded set",
    activeCodes.includes(first2.code),
  );

  // 5) Negative check: active=true + code of inactive policy must yield empty result
  const negativeReq = {
    code: created3.code,
    active: true,
    page: 1,
    limit: 10,
  } satisfies ITodoAppServicePolicy.IRequest;
  const negativePage =
    await api.functional.todoApp.systemAdmin.servicePolicies.index(connection, {
      body: negativeReq,
    });
  typia.assert(negativePage);
  TestValidator.equals(
    "inactive policy code with active=true returns empty list",
    negativePage.data.length,
    0,
  );
}
