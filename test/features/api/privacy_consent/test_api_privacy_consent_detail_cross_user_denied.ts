import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppPrivacyConsent } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPrivacyConsent";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Cross-user privacy consent read must be denied (no data leakage).
 *
 * Business context:
 *
 * - Only the owner (authenticated todoUser) can read their own privacy consent
 *   events.
 * - Accessing another user's consent by ID must be authorization-safe (behave
 *   like not found/forbidden without leaking existence).
 *
 * Steps:
 *
 * 1. Register userB (owner) via /auth/todoUser/join.
 * 2. Under userB, create a privacy consent event via POST
 *    /todoApp/todoUser/users/{userId}/privacyConsents.
 * 3. Still as userB, fetch the created consent by ID to confirm creation.
 * 4. Register userA (attacker) via /auth/todoUser/join to switch auth context.
 * 5. As userA, attempt to GET
 *    /todoApp/todoUser/privacyConsents/{privacyConsentId_of_userB} and expect
 *    an error (authorization-safe denial).
 * 6. Additionally, as userA, attempt to POST a consent for userB's userId and
 *    expect an error (owner-only write protection).
 */
export async function test_api_privacy_consent_detail_cross_user_denied(
  connection: api.IConnection,
) {
  // 1) Register userB (owner)
  const userBBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const userBAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: userBBody });
  typia.assert(userBAuth);

  // 2) Create a privacy consent event for userB
  const consentCreateBody = {
    purpose_code: "analytics",
    purpose_name: "Analytics",
    granted: true,
    policy_version: "v1.0",
    granted_at: new Date().toISOString(),
    revoked_at: null,
    expires_at: null,
    source: "web",
  } satisfies ITodoAppPrivacyConsent.ICreate;
  const createdConsent: ITodoAppPrivacyConsent =
    await api.functional.todoApp.todoUser.users.privacyConsents.create(
      connection,
      {
        userId: userBAuth.id,
        body: consentCreateBody,
      },
    );
  typia.assert(createdConsent);

  // 3) (Sanity) Owner can read their consent by ID
  const ownerRead: ITodoAppPrivacyConsent =
    await api.functional.todoApp.todoUser.privacyConsents.at(connection, {
      privacyConsentId: createdConsent.id,
    });
  typia.assert(ownerRead);
  TestValidator.equals(
    "owner GET returns the same consent id",
    ownerRead.id,
    createdConsent.id,
  );

  // 4) Register userA (attacker) to switch authentication context
  const userABody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const userAAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: userABody });
  typia.assert(userAAuth);

  // 5) As userA, cross-user GET must be denied (no existence leak)
  await TestValidator.error(
    "cross-user GET privacy consent should be denied",
    async () => {
      await api.functional.todoApp.todoUser.privacyConsents.at(connection, {
        privacyConsentId: createdConsent.id,
      });
    },
  );

  // 6) As userA, cross-user create under userB's userId must be denied
  const anotherConsentBody = {
    purpose_code: "analytics",
    purpose_name: "Analytics",
    granted: false,
    policy_version: "v1.1",
    granted_at: new Date().toISOString(),
    revoked_at: null,
    expires_at: null,
    source: "settings_page",
  } satisfies ITodoAppPrivacyConsent.ICreate;
  await TestValidator.error(
    "cross-user CREATE privacy consent for another user should be denied",
    async () => {
      await api.functional.todoApp.todoUser.users.privacyConsents.create(
        connection,
        {
          userId: userBAuth.id, // not current user
          body: anotherConsentBody,
        },
      );
    },
  );
}
