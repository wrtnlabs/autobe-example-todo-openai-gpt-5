import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppPrivacyConsent } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppPrivacyConsent";
import type { ITodoAppPrivacyConsent } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPrivacyConsent";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * List and filter a user's privacy consents with pagination.
 *
 * This test validates that an authenticated todoUser can:
 *
 * 1. Append consent events (grant and withdrawal) for their account
 * 2. Filter listing by granted flag and purpose_code
 * 3. Paginate results with stable ordering (granted_at DESC by default)
 *
 * Workflow
 *
 * - Join as a todoUser and capture userId
 * - Create three consent events with controlled timestamps a) Grant for Purpose A
 *   at older time T1 b) Withdrawal for Purpose A at middle time T2
 *   (granted=false, revoked_at=T2) c) Grant for Purpose B at newest time T3
 * - Validate filters:
 *
 *   - Granted=true & purpose_code=A returns exactly the A grant
 *   - Granted=false & purpose_code=A returns exactly the A withdrawal
 *   - Granted=true with limit=1, page through results; verify DESC order and
 *       non-overlap
 */
export async function test_api_privacy_consents_listing_filters_pagination(
  connection: api.IConnection,
) {
  // Authenticate (join) as a fresh todoUser
  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(authorized);
  const userId = authorized.id;

  // Prepare deterministic timestamps (T1 < T2 < T3)
  const now = new Date();
  const T1 = new Date(now.getTime() - 2 * 60 * 1000).toISOString(); // now - 2m
  const T2 = new Date(now.getTime() - 1 * 60 * 1000).toISOString(); // now - 1m
  const T3 = new Date(now.getTime()).toISOString(); // now

  const purposeA = "purpose_a";
  const purposeB = "purpose_b";
  const policyVersion = "v1.0";

  // Create: Grant for A at T1
  const grantA: ITodoAppPrivacyConsent =
    await api.functional.todoApp.todoUser.users.privacyConsents.create(
      connection,
      {
        userId,
        body: {
          purpose_code: purposeA,
          purpose_name: "Purpose A",
          granted: true,
          policy_version: policyVersion,
          granted_at: T1,
          source: "web",
        } satisfies ITodoAppPrivacyConsent.ICreate,
      },
    );
  typia.assert(grantA);

  // Create: Withdrawal for A at T2 (granted=false, revoked_at=T2)
  const withdrawA: ITodoAppPrivacyConsent =
    await api.functional.todoApp.todoUser.users.privacyConsents.create(
      connection,
      {
        userId,
        body: {
          purpose_code: purposeA,
          purpose_name: "Purpose A",
          granted: false,
          policy_version: policyVersion,
          granted_at: T2,
          revoked_at: T2,
          source: "web",
        } satisfies ITodoAppPrivacyConsent.ICreate,
      },
    );
  typia.assert(withdrawA);

  // Create: Grant for B at T3
  const grantB: ITodoAppPrivacyConsent =
    await api.functional.todoApp.todoUser.users.privacyConsents.create(
      connection,
      {
        userId,
        body: {
          purpose_code: purposeB,
          purpose_name: "Purpose B",
          granted: true,
          policy_version: policyVersion,
          granted_at: T3,
          source: "web",
        } satisfies ITodoAppPrivacyConsent.ICreate,
      },
    );
  typia.assert(grantB);

  // Filter: granted=true & purpose_code=A → exactly the A grant
  const listGrantedA: IPageITodoAppPrivacyConsent =
    await api.functional.todoApp.todoUser.users.privacyConsents.index(
      connection,
      {
        userId,
        body: {
          granted: true,
          purpose_code: purposeA,
          page: 1 satisfies number as number,
          limit: 100 satisfies number as number,
        } satisfies ITodoAppPrivacyConsent.IRequest,
      },
    );
  typia.assert(listGrantedA);
  TestValidator.predicate(
    "granted=true filter for purpose A returns only granted records",
    listGrantedA.data.every(
      (r) => r.granted === true && r.purpose_code === purposeA,
    ),
  );
  TestValidator.equals(
    "purpose A granted list has exactly one record",
    listGrantedA.data.length,
    1,
  );
  TestValidator.equals(
    "purpose A granted item id matches created grant",
    listGrantedA.data[0]?.id,
    grantA.id,
  );

  // Filter: granted=false & purpose_code=A → exactly the A withdrawal
  const listWithdrawnA: IPageITodoAppPrivacyConsent =
    await api.functional.todoApp.todoUser.users.privacyConsents.index(
      connection,
      {
        userId,
        body: {
          granted: false,
          purpose_code: purposeA,
          page: 1 satisfies number as number,
          limit: 100 satisfies number as number,
        } satisfies ITodoAppPrivacyConsent.IRequest,
      },
    );
  typia.assert(listWithdrawnA);
  TestValidator.predicate(
    "granted=false filter for purpose A returns only withdrawn records",
    listWithdrawnA.data.every(
      (r) => r.granted === false && r.purpose_code === purposeA,
    ),
  );
  TestValidator.equals(
    "purpose A withdrawn list has exactly one record",
    listWithdrawnA.data.length,
    1,
  );
  TestValidator.equals(
    "purpose A withdrawn item id matches created withdrawal",
    listWithdrawnA.data[0]?.id,
    withdrawA.id,
  );

  // Pagination test: granted=true across all purposes with limit=1
  const page1: IPageITodoAppPrivacyConsent =
    await api.functional.todoApp.todoUser.users.privacyConsents.index(
      connection,
      {
        userId,
        body: {
          granted: true,
          page: 1 satisfies number as number,
          limit: 1 satisfies number as number,
        } satisfies ITodoAppPrivacyConsent.IRequest,
      },
    );
  typia.assert(page1);
  TestValidator.equals("page1 current is 1", page1.pagination.current, 1);
  TestValidator.equals("page1 limit is 1", page1.pagination.limit, 1);
  TestValidator.equals("page1 has one item", page1.data.length, 1);

  const page2: IPageITodoAppPrivacyConsent =
    await api.functional.todoApp.todoUser.users.privacyConsents.index(
      connection,
      {
        userId,
        body: {
          granted: true,
          page: 2 satisfies number as number,
          limit: 1 satisfies number as number,
        } satisfies ITodoAppPrivacyConsent.IRequest,
      },
    );
  typia.assert(page2);
  TestValidator.equals("page2 current is 2", page2.pagination.current, 2);
  TestValidator.equals("page2 limit is 1", page2.pagination.limit, 1);
  TestValidator.equals("page2 has one item", page2.data.length, 1);

  // Verify non-overlap and DESC order by granted_at
  const id1 = page1.data[0]!.id;
  const id2 = page2.data[0]!.id;
  TestValidator.predicate("page1 and page2 items are different", id1 !== id2);

  const dt1 = new Date(page1.data[0]!.granted_at).getTime();
  const dt2 = new Date(page2.data[0]!.granted_at).getTime();
  TestValidator.predicate(
    "page1 item is newer or same as page2 item (DESC by granted_at)",
    dt1 >= dt2,
  );

  // Expect at least two granted events across purposes (A and B)
  TestValidator.predicate(
    "total granted records is at least 2",
    page1.pagination.records >= 2,
  );
  TestValidator.predicate(
    "total granted pages is at least 2 when limit=1",
    page1.pagination.pages >= 2,
  );
}
