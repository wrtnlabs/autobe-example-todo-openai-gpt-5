import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppPrivacyConsent } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPrivacyConsent";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Validate privacy consent creation and business-rule failures without type
 * errors.
 *
 * Business goals:
 *
 * - Ensure only the authenticated owner can create consent events
 * - Reject unauthenticated attempts
 * - Confirm successful creations and no partial writes after failures
 *
 * Steps:
 *
 * 1. Register a todoUser and authenticate
 * 2. Create a valid consent for self (happy path)
 * 3. Attempt cross-account write (ownership violation) — expect error
 * 4. Attempt unauthenticated creation — expect error
 * 5. Create another valid consent to confirm append-only behavior and no side
 *    effects
 */
export async function test_api_privacy_consent_creation_validation_error(
  connection: api.IConnection,
) {
  // 1) Register a todoUser and authenticate (join)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);

  // 2) Create a valid consent for self (happy path)
  const validConsentBody1 = {
    purpose_code: "analytics",
    purpose_name: "Analytics Tracking",
    granted: true,
    policy_version: "v1.0.0",
  } satisfies ITodoAppPrivacyConsent.ICreate;
  const consent1 =
    await api.functional.todoApp.todoUser.users.privacyConsents.create(
      connection,
      {
        userId: authorized.id,
        body: validConsentBody1,
      },
    );
  typia.assert(consent1);
  TestValidator.equals(
    "created consent should echo purpose_code",
    consent1.purpose_code,
    validConsentBody1.purpose_code,
  );
  TestValidator.equals(
    "created consent should echo purpose_name",
    consent1.purpose_name,
    validConsentBody1.purpose_name,
  );
  TestValidator.equals(
    "created consent should echo granted flag",
    consent1.granted,
    validConsentBody1.granted,
  );
  TestValidator.equals(
    "created consent should echo policy_version",
    consent1.policy_version,
    validConsentBody1.policy_version,
  );

  // 3) Ownership violation: different userId than authenticated subject
  const otherUserId = typia.random<string & tags.Format<"uuid">>();
  TestValidator.predicate(
    "generated otherUserId must differ from authorized.id",
    otherUserId !== authorized.id,
  );
  const invalidConsentBody1 = {
    purpose_code: "marketing_email",
    purpose_name: "Marketing Email",
    granted: false,
    policy_version: "v1.0.0",
  } satisfies ITodoAppPrivacyConsent.ICreate;
  await TestValidator.error(
    "cannot create consent for another user's account (ownership enforced)",
    async () => {
      await api.functional.todoApp.todoUser.users.privacyConsents.create(
        connection,
        {
          userId: otherUserId,
          body: invalidConsentBody1,
        },
      );
    },
  );

  // 4) Unauthenticated attempt should fail
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  const invalidConsentBody2 = {
    purpose_code: "analytics",
    purpose_name: "Analytics Tracking",
    granted: true,
    policy_version: "v1.0.1",
  } satisfies ITodoAppPrivacyConsent.ICreate;
  await TestValidator.error(
    "unauthenticated request must be rejected",
    async () => {
      await api.functional.todoApp.todoUser.users.privacyConsents.create(
        unauthConn,
        {
          userId: authorized.id,
          body: invalidConsentBody2,
        },
      );
    },
  );

  // 5) Another valid consent to ensure no partial writes occurred
  const validConsentBody2 = {
    purpose_code: "preferences",
    purpose_name: "Remember Preferences",
    granted: true,
    policy_version: "v1.0.1",
  } satisfies ITodoAppPrivacyConsent.ICreate;
  const consent2 =
    await api.functional.todoApp.todoUser.users.privacyConsents.create(
      connection,
      {
        userId: authorized.id,
        body: validConsentBody2,
      },
    );
  typia.assert(consent2);
  TestValidator.notEquals(
    "subsequent consent event should have a distinct id (append-only)",
    consent2.id,
    consent1.id,
  );
}
