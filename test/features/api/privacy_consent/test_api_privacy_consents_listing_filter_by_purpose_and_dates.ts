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
 * List privacy consents filtered by purpose_code and granted_at range,
 * verifying default sorting (granted_at desc).
 *
 * Steps:
 *
 * 1. Register (join) a todoUser to obtain authenticated context and userId.
 * 2. Append three consent events with explicit granted_at timestamps:
 *
 *    - Marketing at T1 (older)
 *    - Analytics at T2 (middle)
 *    - Marketing at T3 (newer)
 * 3. Call listing (index) with purpose_code=marketing and granted_at range [T1,
 *    T3].
 * 4. Validate: only marketing in range are returned, count=2, sorted by granted_at
 *    desc, and returned IDs match the two marketing events exactly.
 */
export async function test_api_privacy_consents_listing_filter_by_purpose_and_dates(
  connection: api.IConnection,
) {
  // 1) Register and authenticate as todoUser
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);
  const userId = authorized.id;

  // 2) Prepare granted_at timestamps (ISO strings)
  const now = new Date();
  const t1 = new Date(now.getTime() - 10 * 60 * 1000).toISOString(); // now - 10 min
  const t2 = new Date(now.getTime() - 5 * 60 * 1000).toISOString(); // now - 5 min
  const t3 = new Date(now.getTime() - 1 * 60 * 1000).toISOString(); // now - 1 min

  // Create: marketing @ T1
  const marketingOlderBody = {
    purpose_code: "marketing",
    purpose_name: "Marketing",
    granted: true,
    policy_version: "v1.0",
    granted_at: t1,
    source: "web",
  } satisfies ITodoAppPrivacyConsent.ICreate;
  const marketingOlder =
    await api.functional.todoApp.todoUser.users.privacyConsents.create(
      connection,
      { userId, body: marketingOlderBody },
    );
  typia.assert(marketingOlder);

  // Create: analytics @ T2
  const analyticsBody = {
    purpose_code: "analytics",
    purpose_name: "Analytics",
    granted: true,
    policy_version: "v1.0",
    granted_at: t2,
    source: "web",
  } satisfies ITodoAppPrivacyConsent.ICreate;
  const analytics =
    await api.functional.todoApp.todoUser.users.privacyConsents.create(
      connection,
      { userId, body: analyticsBody },
    );
  typia.assert(analytics);

  // Create: marketing @ T3
  const marketingNewerBody = {
    purpose_code: "marketing",
    purpose_name: "Marketing",
    granted: true,
    policy_version: "v1.0",
    granted_at: t3,
    source: "web",
  } satisfies ITodoAppPrivacyConsent.ICreate;
  const marketingNewer =
    await api.functional.todoApp.todoUser.users.privacyConsents.create(
      connection,
      { userId, body: marketingNewerBody },
    );
  typia.assert(marketingNewer);

  // 3) List with purpose filter and granted_at range [T1, T3]
  const listBody = {
    purpose_code: "marketing",
    granted_from: t1,
    granted_to: t3,
  } satisfies ITodoAppPrivacyConsent.IRequest;
  const page =
    await api.functional.todoApp.todoUser.users.privacyConsents.index(
      connection,
      { userId, body: listBody },
    );
  typia.assert(page);

  const results = page.data;

  // 4) Validations
  TestValidator.equals(
    "exactly two marketing consents returned in the range",
    results.length,
    2,
  );
  TestValidator.predicate(
    "all results have purpose_code=marketing",
    results.every((r) => r.purpose_code === "marketing"),
  );
  TestValidator.predicate(
    "granted_at within [from,to] inclusive",
    results.every((r) => r.granted_at >= t1 && r.granted_at <= t3),
  );
  TestValidator.predicate(
    "default sorting by granted_at desc (non-increasing)",
    results.every((r, i, arr) =>
      i === 0 ? true : arr[i - 1].granted_at >= r.granted_at,
    ),
  );
  const returnedIds = [...results.map((r) => r.id)].sort();
  const expectedIds = [marketingOlder.id, marketingNewer.id].sort();
  TestValidator.equals(
    "returned ids match created marketing event ids (set equality)",
    returnedIds,
    expectedIds,
  );
  TestValidator.predicate(
    "analytics event excluded by purpose_code filter",
    !results.some((r) => r.id === analytics.id),
  );
}
