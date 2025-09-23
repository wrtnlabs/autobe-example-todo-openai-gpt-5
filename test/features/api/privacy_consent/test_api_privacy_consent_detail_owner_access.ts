import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppPrivacyConsent } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPrivacyConsent";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_privacy_consent_detail_owner_access(
  connection: api.IConnection,
) {
  /**
   * Validate that an authenticated todoUser can retrieve a specific privacy
   * consent they own. Also verify that other users cannot access the owner's
   * consent and that a non-existent ID is not retrievable by the owner
   * (not-found style without leaking existence).
   *
   * Steps:
   *
   * 1. Register and authenticate owner (todoUser.join) → get owner.id
   * 2. Create a consent event for owner (privacyConsents.create) → get consent.id
   * 3. Retrieve the consent by ID as owner (privacyConsents.at) → verify equality
   *    of key fields
   * 4. Attempt retrieval with a random non-existent UUID as owner → expect error
   * 5. Register and authenticate another user → attempt cross-tenant fetch →
   *    expect error
   */

  // 1) Register and authenticate the owner
  const ownerEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const ownerPassword: string = RandomGenerator.alphaNumeric(12);
  const ownerAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email: ownerEmail,
        password: ownerPassword,
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(ownerAuth);

  // 2) Create a consent event for the owner
  const createConsentBody = {
    purpose_code: "analytics",
    purpose_name: "Analytics tracking",
    granted: true,
    policy_version: "1.0",
    granted_at: new Date().toISOString(),
    revoked_at: null,
    expires_at: null,
    source: "web",
  } satisfies ITodoAppPrivacyConsent.ICreate;

  const created: ITodoAppPrivacyConsent =
    await api.functional.todoApp.todoUser.users.privacyConsents.create(
      connection,
      {
        userId: ownerAuth.id,
        body: createConsentBody,
      },
    );
  typia.assert(created);

  // 3) Retrieve the consent by ID as owner
  const fetched: ITodoAppPrivacyConsent =
    await api.functional.todoApp.todoUser.users.privacyConsents.at(connection, {
      userId: ownerAuth.id,
      privacyConsentId: created.id,
    });
  typia.assert(fetched);

  // Verify key fields for data integrity
  TestValidator.equals("fetched id equals created id", fetched.id, created.id);
  TestValidator.equals(
    "purpose_code should match",
    fetched.purpose_code,
    created.purpose_code,
  );
  TestValidator.equals(
    "purpose_name should match",
    fetched.purpose_name,
    created.purpose_name,
  );
  TestValidator.equals(
    "granted should match",
    fetched.granted,
    created.granted,
  );
  TestValidator.equals(
    "policy_version should match",
    fetched.policy_version,
    created.policy_version,
  );
  TestValidator.equals(
    "granted_at should match persisted value",
    fetched.granted_at,
    created.granted_at,
  );

  // 4) Non-existent consent for the same owner should error
  let randomId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();
  if (randomId === created.id)
    randomId = typia.random<string & tags.Format<"uuid">>();
  await TestValidator.error(
    "owner cannot fetch non-existent consent",
    async () => {
      await api.functional.todoApp.todoUser.users.privacyConsents.at(
        connection,
        {
          userId: ownerAuth.id,
          privacyConsentId: randomId,
        },
      );
    },
  );

  // 5) Cross-tenant access prevention: another user should not access owner's consent
  const attackerEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const attackerPassword: string = RandomGenerator.alphaNumeric(12);
  const attackerAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email: attackerEmail,
        password: attackerPassword,
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(attackerAuth);

  await TestValidator.error(
    "other user cannot access owner's consent",
    async () => {
      await api.functional.todoApp.todoUser.users.privacyConsents.at(
        connection,
        {
          userId: attackerAuth.id,
          privacyConsentId: created.id,
        },
      );
    },
  );
}
