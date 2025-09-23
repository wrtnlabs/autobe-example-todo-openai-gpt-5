import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppPrivacyConsent } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPrivacyConsent";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_privacy_consent_detail_own_record(
  connection: api.IConnection,
) {
  /**
   * Authenticate → create consent → retrieve by id → validate matching fields.
   *
   * Steps:
   *
   * 1. Register and authenticate a todoUser via join
   * 2. Create a privacy consent event for purpose_code "analytics" with
   *    granted=true
   * 3. Retrieve the created consent by its id using the protected GET endpoint
   * 4. Validate: id equality and critical business fields match creation input
   */

  // 1) Register and authenticate a new todoUser
  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: typia.random<ITodoAppTodoUser.ICreate>(),
    });
  typia.assert(authorized);

  // 2) Create a privacy consent event for the authenticated user
  const consentCreateBody = {
    purpose_code: "analytics",
    purpose_name: "Analytics",
    granted: true,
    policy_version: "1.0",
    granted_at: new Date().toISOString(),
    source: "web",
  } satisfies ITodoAppPrivacyConsent.ICreate;

  const created: ITodoAppPrivacyConsent =
    await api.functional.todoApp.todoUser.users.privacyConsents.create(
      connection,
      {
        userId: authorized.id,
        body: consentCreateBody,
      },
    );
  typia.assert(created);

  // 3) Retrieve the consent by ID (same authenticated context)
  const read: ITodoAppPrivacyConsent =
    await api.functional.todoApp.todoUser.privacyConsents.at(connection, {
      privacyConsentId: created.id,
    });
  typia.assert(read);

  // 4) Validate response business logic
  TestValidator.equals(
    "retrieved consent id equals created id",
    read.id,
    created.id,
  );
  TestValidator.equals(
    "purpose_code matches creation input",
    read.purpose_code,
    consentCreateBody.purpose_code,
  );
  TestValidator.equals(
    "purpose_name matches creation input",
    read.purpose_name,
    consentCreateBody.purpose_name,
  );
  TestValidator.equals(
    "granted flag matches creation input (true)",
    read.granted,
    consentCreateBody.granted,
  );
  TestValidator.equals(
    "policy_version matches creation input",
    read.policy_version,
    consentCreateBody.policy_version,
  );

  // revoked_at not provided → should be null (or undefined on some systems)
  const revokedAt: (string & tags.Format<"date-time">) | null =
    read.revoked_at ?? null;
  TestValidator.equals(
    "revoked_at is null when no revocation provided",
    revokedAt,
    null,
  );

  // optional source is echoed when provided
  TestValidator.equals(
    "source matches creation input when provided",
    read.source ?? null,
    consentCreateBody.source ?? null,
  );
}
