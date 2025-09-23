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
 * Validate that the privacy consent listing rejects invalid pagination sizes.
 *
 * Business flow:
 *
 * 1. Register a new todoUser (join) to obtain authentication. The SDK sets the
 *    Authorization header automatically.
 * 2. Create a baseline privacy consent event for this user, ensuring that listing
 *    would normally return at least one record.
 * 3. Control listing with a valid pagination (page=1, limit=10) to confirm success
 *    and presence of data.
 * 4. Error listings with invalid limits (0 and 1000) should be rejected by
 *    server-side validation.
 *
 * Validations:
 *
 * - Control listing returns at least one record and does not exceed limit.
 * - Invalid limits trigger errors (validated via TestValidator.error without
 *   checking specific status codes).
 */
export async function test_api_privacy_consents_listing_invalid_pagination(
  connection: api.IConnection,
) {
  // 1) Register a new todoUser and obtain auth
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // 8–64 as per policy; we use 12
  } satisfies ITodoAppTodoUser.ICreate;
  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBody });
  typia.assert(authorized);

  // 2) Create a baseline privacy consent record for the user
  const createConsentBody = {
    purpose_code: `pc_${RandomGenerator.alphabets(6)}`,
    purpose_name: RandomGenerator.paragraph({ sentences: 3 }),
    granted: true,
    policy_version: `v${RandomGenerator.alphaNumeric(3)}`,
    granted_at: new Date().toISOString(), // DTO requires ISO string if provided
    source: "web",
  } satisfies ITodoAppPrivacyConsent.ICreate;
  const created: ITodoAppPrivacyConsent =
    await api.functional.todoApp.todoUser.users.privacyConsents.create(
      connection,
      { userId: authorized.id, body: createConsentBody },
    );
  typia.assert(created);

  // 3) Control: valid listing (should succeed and include data)
  const validListBody = {
    page: 1,
    limit: 10,
  } satisfies ITodoAppPrivacyConsent.IRequest;
  const page: IPageITodoAppPrivacyConsent =
    await api.functional.todoApp.todoUser.users.privacyConsents.index(
      connection,
      { userId: authorized.id, body: validListBody },
    );
  typia.assert(page);
  TestValidator.predicate(
    "valid listing returns at least one record",
    page.data.length >= 1,
  );
  TestValidator.predicate(
    "result set does not exceed requested limit",
    page.data.length <= 10,
  );

  // 4) Error case: limit = 0 (invalid minimal boundary)
  const invalidZeroLimit = {
    page: 1,
    limit: 0,
  } satisfies ITodoAppPrivacyConsent.IRequest;
  await TestValidator.error(
    "limit 0 should be rejected by pagination validation",
    async () => {
      await api.functional.todoApp.todoUser.users.privacyConsents.index(
        connection,
        { userId: authorized.id, body: invalidZeroLimit },
      );
    },
  );

  // 5) Error case: excessively large limit (e.g., 1000)
  const invalidLargeLimit = {
    page: 1,
    limit: 1000,
  } satisfies ITodoAppPrivacyConsent.IRequest;
  await TestValidator.error(
    "excessively large limit should be rejected by pagination validation",
    async () => {
      await api.functional.todoApp.todoUser.users.privacyConsents.index(
        connection,
        { userId: authorized.id, body: invalidLargeLimit },
      );
    },
  );
}
