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
 * List privacy consents filtered by purpose and grant state for the
 * authenticated todoUser.
 *
 * Business flow
 *
 * 1. Register (join) a new todoUser and obtain authorized context (id + token).
 * 2. Seed append-only consent events for that user:
 *
 *    - Grant marketing_emails at T1
 *    - Withdraw marketing_emails at T2 (granted=false, revoked_at present)
 *    - Grant product_updates at T3 (different purpose)
 * 3. Call PATCH /todoApp/todoUser/privacyConsents with filters
 *
 *    - Purpose_code = "marketing_emails"
 *    - Granted = true
 *    - Page = 1, limit = 20 (relies on backend default sorting by granted_at desc)
 * 4. Validate
 *
 *    - All items match purpose_code AND granted=true
 *    - The created grant event is included, withdrawal excluded
 *    - Pagination limit matches request
 *    - Results are sorted non-increasing by granted_at
 * 5. Negative cases
 *
 *    - Invalid limit (0 and >100) should produce validation errors
 */
export async function test_api_privacy_consent_list_filter_by_purpose_and_grant_state(
  connection: api.IConnection,
) {
  // 1) Authenticate (join) to get userId and token
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12);
  const auth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email,
        password,
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(auth);

  // Helper timestamps to control ordering
  const now: number = Date.now();
  const T1: string & tags.Format<"date-time"> = new Date(
    now - 5 * 60 * 1000,
  ).toISOString() as string & tags.Format<"date-time">; // 5 minutes ago
  const T2: string & tags.Format<"date-time"> = new Date(
    now - 2 * 60 * 1000,
  ).toISOString() as string & tags.Format<"date-time">; // 2 minutes ago
  const T3: string & tags.Format<"date-time"> = new Date(
    now - 1 * 60 * 1000,
  ).toISOString() as string & tags.Format<"date-time">; // 1 minute ago

  // 2) Seed consent events (append-only)
  const grantedMarketing: ITodoAppPrivacyConsent =
    await api.functional.todoApp.todoUser.users.privacyConsents.create(
      connection,
      {
        userId: auth.id,
        body: {
          purpose_code: "marketing_emails",
          purpose_name: "Marketing Emails",
          granted: true,
          policy_version: "v1.0",
          granted_at: T1,
          source: "web",
        } satisfies ITodoAppPrivacyConsent.ICreate,
      },
    );
  typia.assert(grantedMarketing);

  const withdrawnMarketing: ITodoAppPrivacyConsent =
    await api.functional.todoApp.todoUser.users.privacyConsents.create(
      connection,
      {
        userId: auth.id,
        body: {
          purpose_code: "marketing_emails",
          purpose_name: "Marketing Emails",
          granted: false,
          policy_version: "v1.0",
          granted_at: T2,
          revoked_at: T2,
          source: "web",
        } satisfies ITodoAppPrivacyConsent.ICreate,
      },
    );
  typia.assert(withdrawnMarketing);

  const grantedProductUpdates: ITodoAppPrivacyConsent =
    await api.functional.todoApp.todoUser.users.privacyConsents.create(
      connection,
      {
        userId: auth.id,
        body: {
          purpose_code: "product_updates",
          purpose_name: "Product Updates",
          granted: true,
          policy_version: "v1.0",
          granted_at: T3,
          source: "web",
        } satisfies ITodoAppPrivacyConsent.ICreate,
      },
    );
  typia.assert(grantedProductUpdates);

  // 3) List consents with filter (purpose_code=marketing_emails AND granted=true)
  const reqLimit = 20;
  const reqPage = 1;
  const listing: IPageITodoAppPrivacyConsent.ISummary =
    await api.functional.todoApp.todoUser.privacyConsents.index(connection, {
      body: {
        page: reqPage,
        limit: reqLimit,
        purpose_code: "marketing_emails",
        granted: true,
      } satisfies ITodoAppPrivacyConsent.IRequest,
    });
  typia.assert(listing);

  // 4) Validations
  TestValidator.predicate(
    "all items match purpose_code=marketing_emails and granted=true",
    listing.data.every(
      (i) => i.purpose_code === "marketing_emails" && i.granted === true,
    ),
  );

  TestValidator.predicate(
    "result includes the granted marketing_emails event",
    listing.data.some((i) => i.id === grantedMarketing.id),
  );

  TestValidator.predicate(
    "result excludes the withdrawn marketing_emails event (granted=false)",
    !listing.data.some((i) => i.id === withdrawnMarketing.id),
  );

  TestValidator.equals(
    "pagination limit equals requested limit",
    listing.pagination.limit,
    reqLimit,
  );

  // Check sorting: granted_at is in non-increasing order (desc)
  const nonIncreasing: boolean = listing.data.every((elem, idx, arr) =>
    idx === 0
      ? true
      : new Date(arr[idx - 1].granted_at).getTime() >=
        new Date(elem.granted_at).getTime(),
  );
  TestValidator.predicate(
    "sorted by granted_at in non-increasing order (desc)",
    nonIncreasing,
  );

  // 5) Negative scenarios: invalid limits
  await TestValidator.error(
    "invalid limit (0) should be rejected",
    async () => {
      await api.functional.todoApp.todoUser.privacyConsents.index(connection, {
        body: {
          page: reqPage,
          limit: 0,
          purpose_code: "marketing_emails",
          granted: true,
        } satisfies ITodoAppPrivacyConsent.IRequest,
      });
    },
  );

  await TestValidator.error(
    "invalid limit (>100) should be rejected",
    async () => {
      await api.functional.todoApp.todoUser.privacyConsents.index(connection, {
        body: {
          page: reqPage,
          limit: 101,
          purpose_code: "marketing_emails",
          granted: true,
        } satisfies ITodoAppPrivacyConsent.IRequest,
      });
    },
  );
}
