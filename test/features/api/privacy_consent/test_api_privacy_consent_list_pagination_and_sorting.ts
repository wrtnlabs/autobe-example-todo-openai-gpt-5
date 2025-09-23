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
 * Validate pagination and default sorting of privacy consents for the
 * authenticated user and verify owner-only scoping.
 *
 * Steps:
 *
 * 1. Join as user A
 * 2. Seed 6 consent events for user A with unique granted_at timestamps and mixed
 *    purposes
 * 3. List page=1, limit=2 and verify top-2 most recent by granted_at (desc)
 * 4. List page=2, limit=2 and verify next-2; ensure no overlap with page 1
 * 5. List page=3, limit=2 and verify final-2; complete global ordering check
 * 6. Request out-of-range page and expect empty results
 * 7. Join as user B, seed 3 events, list and ensure only user B events are
 *    returned
 */
export async function test_api_privacy_consent_list_pagination_and_sorting(
  connection: api.IConnection,
) {
  // 1) Authenticate as user A (join)
  const userA = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(userA);

  // 2) Seed 6 consent events with unique granted_at timestamps and varied purposes
  const purposes = ["analytics", "marketing_email"] as const;
  const now = Date.now();
  const userAEvents: ITodoAppPrivacyConsent[] = await ArrayUtil.asyncRepeat(
    6,
    async (i) => {
      const grantedAtIso = new Date(
        now - (i + 1) * 60 * 60 * 1000,
      ).toISOString(); // each 1h older
      const created =
        await api.functional.todoApp.todoUser.users.privacyConsents.create(
          connection,
          {
            userId: userA.id,
            body: {
              purpose_code: purposes[i % purposes.length],
              purpose_name: `${purposes[i % purposes.length]} purpose`,
              granted: i % 2 === 0, // alternate true/false
              policy_version: `v${1 + (i % 3)}.0`,
              granted_at: grantedAtIso,
              source: "web",
            } satisfies ITodoAppPrivacyConsent.ICreate,
          },
        );
      typia.assert(created);
      return created;
    },
  );

  // Prepare expected ordering (desc by granted_at)
  const expectedDescIdsA: string[] = [...userAEvents]
    .sort((a, b) =>
      a.granted_at < b.granted_at ? 1 : a.granted_at > b.granted_at ? -1 : 0,
    )
    .map((e) => e.id);

  // 3) Page 1, limit 2
  const page1 = await api.functional.todoApp.todoUser.privacyConsents.index(
    connection,
    {
      body: {
        page: 1,
        limit: 2,
      } satisfies ITodoAppPrivacyConsent.IRequest,
    },
  );
  typia.assert(page1);
  TestValidator.equals("page1 length equals limit", page1.data.length, 2);
  TestValidator.equals(
    "page1 pagination.limit equals 2",
    page1.pagination.limit,
    2,
  );
  TestValidator.equals(
    "page1 ids match expected top-2 by granted_at desc",
    page1.data.map((d) => d.id),
    expectedDescIdsA.slice(0, 2),
  );

  // 4) Page 2, limit 2
  const page2 = await api.functional.todoApp.todoUser.privacyConsents.index(
    connection,
    {
      body: {
        page: 2,
        limit: 2,
      } satisfies ITodoAppPrivacyConsent.IRequest,
    },
  );
  typia.assert(page2);
  TestValidator.equals("page2 length equals limit", page2.data.length, 2);
  TestValidator.equals(
    "page2 ids match expected next-2 by granted_at desc",
    page2.data.map((d) => d.id),
    expectedDescIdsA.slice(2, 4),
  );
  const ids1 = new Set(page1.data.map((d) => d.id));
  const overlap = page2.data.some((d) => ids1.has(d.id));
  TestValidator.predicate("page1/page2 must have no overlap", !overlap);

  // 5) Page 3, limit 2 — final slice
  const page3 = await api.functional.todoApp.todoUser.privacyConsents.index(
    connection,
    {
      body: {
        page: 3,
        limit: 2,
      } satisfies ITodoAppPrivacyConsent.IRequest,
    },
  );
  typia.assert(page3);
  TestValidator.equals(
    "page3 length equals limit or remaining 2",
    page3.data.length,
    2,
  );
  TestValidator.equals(
    "page3 ids match expected last-2 by granted_at desc",
    page3.data.map((d) => d.id),
    expectedDescIdsA.slice(4, 6),
  );

  // Out-of-range page should return empty data
  const outOfRangePage = page1.pagination.pages + 1;
  const pageX = await api.functional.todoApp.todoUser.privacyConsents.index(
    connection,
    {
      body: {
        page: outOfRangePage,
        limit: 2,
      } satisfies ITodoAppPrivacyConsent.IRequest,
    },
  );
  typia.assert(pageX);
  TestValidator.equals(
    "out-of-range page returns empty data",
    pageX.data.length,
    0,
  );

  // 7) Owner-only scoping: join as user B, seed records, and verify isolation
  const userB = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(userB);

  const baseB = Date.now() - 1000 * 60 * 60 * 24; // start 1 day earlier base
  const userBEvents: ITodoAppPrivacyConsent[] = await ArrayUtil.asyncRepeat(
    3,
    async (i) => {
      const ts = new Date(baseB - (i + 1) * 60 * 60 * 1000).toISOString();
      const created =
        await api.functional.todoApp.todoUser.users.privacyConsents.create(
          connection,
          {
            userId: userB.id,
            body: {
              purpose_code: purposes[(i + 1) % purposes.length],
              purpose_name: `${purposes[(i + 1) % purposes.length]} purpose`,
              granted: true,
              policy_version: `v${1 + (i % 2)}.0`,
              granted_at: ts,
              source: "mobile",
            } satisfies ITodoAppPrivacyConsent.ICreate,
          },
        );
      typia.assert(created);
      return created;
    },
  );

  // List for user B with a larger page size to get all
  const listB = await api.functional.todoApp.todoUser.privacyConsents.index(
    connection,
    {
      body: {
        page: 1,
        limit: 100,
      } satisfies ITodoAppPrivacyConsent.IRequest,
    },
  );
  typia.assert(listB);
  const userBIds = new Set(userBEvents.map((e) => e.id));
  const notInB = listB.data.some((d) => !userBIds.has(d.id));
  TestValidator.predicate(
    "user B listing must contain only user B events",
    !notInB,
  );

  const userAIds = new Set(userAEvents.map((e) => e.id));
  const leakedFromA = listB.data.some((d) => userAIds.has(d.id));
  TestValidator.predicate(
    "user B listing must not contain user A events",
    !leakedFromA,
  );
}
