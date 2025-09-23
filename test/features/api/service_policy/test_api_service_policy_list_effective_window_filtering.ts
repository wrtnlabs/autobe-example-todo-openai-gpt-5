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

export async function test_api_service_policy_list_effective_window_filtering(
  connection: api.IConnection,
) {
  /**
   * Validate active-state and effective window filtering on service policy
   * listing.
   *
   * Steps:
   *
   * 1. Join as system admin
   * 2. Create 4 policies in a unique namespace: currentActive, futureActive,
   *    expiredActive, currentInactive
   * 3. List with filters (active=true, window includes now)
   * 4. Validate only currentActive is returned
   */

  // 1) Authenticate as systemAdmin
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: adminJoinBody,
    });
  typia.assert(adminAuth);

  // Prepare unique namespace and time anchors
  const namespace = `e2e-${RandomGenerator.alphaNumeric(12)}`;
  const now = new Date();
  const nowISO = now.toISOString();

  const currentFrom = new Date(now.getTime() - 60 * 60 * 1000).toISOString(); // now - 1h
  const currentTo = new Date(now.getTime() + 60 * 60 * 1000).toISOString(); // now + 1h

  const futureFrom = new Date(
    now.getTime() + 24 * 60 * 60 * 1000,
  ).toISOString(); // now + 1d
  const futureTo = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(); // now + 2d

  const expiredFrom = new Date(
    now.getTime() - 48 * 60 * 60 * 1000,
  ).toISOString(); // now - 2d
  const expiredTo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(); // now - 1d

  const inactiveFrom = new Date(
    now.getTime() - 2 * 60 * 60 * 1000,
  ).toISOString(); // now - 2h
  const inactiveTo = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(); // now + 2h

  // 2) Seed policies
  const currentActive =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: {
          namespace,
          code: `${namespace}-current-${RandomGenerator.alphaNumeric(8)}`,
          name: RandomGenerator.paragraph({ sentences: 3 }),
          description: RandomGenerator.paragraph({ sentences: 6 }),
          value: "on",
          value_type: "string",
          active: true,
          effective_from: currentFrom,
          effective_to: currentTo,
        } satisfies ITodoAppServicePolicy.ICreate,
      },
    );
  typia.assert(currentActive);

  const futureActive =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: {
          namespace,
          code: `${namespace}-future-${RandomGenerator.alphaNumeric(8)}`,
          name: RandomGenerator.paragraph({ sentences: 3 }),
          description: RandomGenerator.paragraph({ sentences: 6 }),
          value: "on",
          value_type: "string",
          active: true,
          effective_from: futureFrom,
          effective_to: futureTo,
        } satisfies ITodoAppServicePolicy.ICreate,
      },
    );
  typia.assert(futureActive);

  const expiredActive =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: {
          namespace,
          code: `${namespace}-expired-${RandomGenerator.alphaNumeric(8)}`,
          name: RandomGenerator.paragraph({ sentences: 3 }),
          description: RandomGenerator.paragraph({ sentences: 6 }),
          value: "on",
          value_type: "string",
          active: true,
          effective_from: expiredFrom,
          effective_to: expiredTo,
        } satisfies ITodoAppServicePolicy.ICreate,
      },
    );
  typia.assert(expiredActive);

  const currentInactive =
    await api.functional.todoApp.systemAdmin.servicePolicies.create(
      connection,
      {
        body: {
          namespace,
          code: `${namespace}-inactive-${RandomGenerator.alphaNumeric(8)}`,
          name: RandomGenerator.paragraph({ sentences: 3 }),
          description: RandomGenerator.paragraph({ sentences: 6 }),
          value: "off",
          value_type: "string",
          active: false,
          effective_from: inactiveFrom,
          effective_to: inactiveTo,
        } satisfies ITodoAppServicePolicy.ICreate,
      },
    );
  typia.assert(currentInactive);

  // 3) List with filters for active + currently effective
  const page = await api.functional.todoApp.systemAdmin.servicePolicies.index(
    connection,
    {
      body: {
        namespace,
        active: true,
        effective_from_to: nowISO, // effective_from <= now
        effective_to_from: nowISO, // effective_to >= now (exclusive end business-wise)
        page: 1,
        limit: 100,
        sort: "created_at",
        direction: "asc",
      } satisfies ITodoAppServicePolicy.IRequest,
    },
  );
  typia.assert(page);

  // 4) Validations
  TestValidator.equals(
    "only current effective and active policies are listed",
    page.data.length,
    1,
  );

  // Validate identity match
  const got = page.data[0];
  TestValidator.equals(
    "returned policy id equals currentActive",
    got.id,
    currentActive.id,
  );
  TestValidator.equals(
    "returned policy code equals currentActive",
    got.code,
    currentActive.code,
  );

  // Ensure business rules on all returned records
  TestValidator.predicate(
    "every returned policy is active",
    page.data.every((p) => p.active === true),
  );
  TestValidator.predicate(
    "every returned policy window includes now",
    page.data.every((p) => {
      const fromOk =
        p.effective_from === null ||
        p.effective_from === undefined ||
        p.effective_from <= nowISO;
      const toOk =
        p.effective_to === null ||
        p.effective_to === undefined ||
        nowISO < p.effective_to; // exclusive end
      return fromOk && toOk;
    }),
  );
}
