import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppPrivacyConsent } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPrivacyConsent";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_privacy_consent_withdrawal_append_history(
  connection: api.IConnection,
) {
  /**
   * Validate append-only consent history when recording a withdrawal.
   *
   * Steps:
   *
   * 1. Join as todoUser A
   * 2. Append a grant consent event
   * 3. Append a withdrawal event for the same purpose/policy
   * 4. Validate new snapshot (different id), flags/timestamps, and field
   *    consistency
   * 5. Negative: another user cannot append events for user A
   */
  // 1) Authenticate (join) as user A
  const userA = await api.functional.auth.todoUser.join(connection, {
    body: typia.random<ITodoAppTodoUser.ICreate>(),
  });
  typia.assert(userA);

  const userAId = userA.id; // path param for subsequent calls

  // Common purpose/policy context to ensure same logical timeline
  const purposeCode = "analytics";
  const purposeName = "Analytics";
  const policyVersion = "v1.0";

  // Establish a small time separation to ensure ordering
  const grantAt = new Date().toISOString();
  const revokeAt = new Date(Date.now() + 1_000).toISOString();

  // 2) Create initial grant consent event
  const grant =
    await api.functional.todoApp.todoUser.users.privacyConsents.create(
      connection,
      {
        userId: userAId,
        body: {
          purpose_code: purposeCode,
          purpose_name: purposeName,
          granted: true,
          policy_version: policyVersion,
          granted_at: grantAt,
          source: "settings_page",
        } satisfies ITodoAppPrivacyConsent.ICreate,
      },
    );
  typia.assert(grant);

  // 3) Create withdrawal event (append-only)
  const withdrawal =
    await api.functional.todoApp.todoUser.users.privacyConsents.create(
      connection,
      {
        userId: userAId,
        body: {
          purpose_code: purposeCode,
          purpose_name: purposeName,
          granted: false,
          policy_version: policyVersion,
          granted_at: revokeAt,
          revoked_at: revokeAt,
          source: "settings_page",
        } satisfies ITodoAppPrivacyConsent.ICreate,
      },
    );
  typia.assert(withdrawal);

  // 4) Business validations
  TestValidator.notEquals(
    "withdrawal should have a different id (append-only history)",
    withdrawal.id,
    grant.id,
  );
  TestValidator.equals("grant.granted is true", grant.granted, true);
  TestValidator.equals(
    "withdrawal.granted is false",
    withdrawal.granted,
    false,
  );

  TestValidator.equals(
    "purpose_code preserved across events",
    withdrawal.purpose_code,
    purposeCode,
  );
  TestValidator.equals(
    "policy_version preserved across events",
    withdrawal.policy_version,
    policyVersion,
  );

  // Grant record should not have a revoked_at
  TestValidator.predicate(
    "grant.revoked_at should be null or undefined",
    grant.revoked_at === null || grant.revoked_at === undefined,
  );

  // Withdrawal record should have revoked_at
  TestValidator.predicate(
    "withdrawal.revoked_at should be present",
    withdrawal.revoked_at !== null && withdrawal.revoked_at !== undefined,
  );

  // Ordering check: withdrawal event should not be earlier than the grant
  TestValidator.predicate(
    "withdrawal.granted_at should be >= grant.granted_at",
    () =>
      new Date(withdrawal.granted_at).getTime() >=
      new Date(grant.granted_at).getTime(),
  );

  // 5) Negative/permission test - another user cannot append to user A's timeline
  const userB = await api.functional.auth.todoUser.join(connection, {
    body: typia.random<ITodoAppTodoUser.ICreate>(),
  });
  typia.assert(userB);

  await TestValidator.error(
    "another user cannot append consent for user A",
    async () => {
      await api.functional.todoApp.todoUser.users.privacyConsents.create(
        connection,
        {
          userId: userAId,
          body: {
            purpose_code: purposeCode,
            purpose_name: purposeName,
            granted: false,
            policy_version: policyVersion,
            granted_at: new Date(Date.now() + 2_000).toISOString(),
            revoked_at: new Date(Date.now() + 2_000).toISOString(),
            source: "settings_page",
          } satisfies ITodoAppPrivacyConsent.ICreate,
        },
      );
    },
  );
}
