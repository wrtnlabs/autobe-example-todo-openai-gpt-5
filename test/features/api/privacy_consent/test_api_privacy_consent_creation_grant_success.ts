import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppPrivacyConsent } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPrivacyConsent";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_privacy_consent_creation_grant_success(
  connection: api.IConnection,
) {
  /**
   * Happy path: authenticated todoUser appends a grant consent event, then
   * verify echoed fields and grant semantics. Also validate permission boundary
   * by ensuring another user cannot write consent for the first user.
   */

  // 1) Authenticate (join) as the owner todoUser
  const ownerJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const ownerAuth = await api.functional.auth.todoUser.join(connection, {
    body: ownerJoinBody,
  });
  typia.assert(ownerAuth);

  // 2) Create a grant consent for the owner (omitting granted_at to let server stamp)
  const grantBody = {
    purpose_code: `analytics_${RandomGenerator.alphaNumeric(6)}`,
    purpose_name: "Analytics Consent",
    granted: true,
    policy_version: `v${RandomGenerator.alphaNumeric(4)}`,
    revoked_at: null, // explicitly null for a grant event
    source: "web",
  } satisfies ITodoAppPrivacyConsent.ICreate;

  const created =
    await api.functional.todoApp.todoUser.users.privacyConsents.create(
      connection,
      {
        userId: ownerAuth.id,
        body: grantBody,
      },
    );
  typia.assert(created);

  // 3) Validate echoed fields and grant semantics
  TestValidator.equals(
    "purpose_code echoed from request",
    created.purpose_code,
    grantBody.purpose_code,
  );
  TestValidator.equals(
    "purpose_name echoed from request",
    created.purpose_name,
    grantBody.purpose_name,
  );
  TestValidator.equals("granted flag is true", created.granted, true);
  TestValidator.equals(
    "policy_version echoed from request",
    created.policy_version,
    grantBody.policy_version,
  );
  TestValidator.equals(
    "source echoed from request",
    created.source,
    grantBody.source,
  );
  TestValidator.predicate(
    "revoked_at should be nullish on grant",
    created.revoked_at === null || created.revoked_at === undefined,
  );

  // 4) Negative case: another user cannot write consent for owner
  const intruderJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const intruderAuth = await api.functional.auth.todoUser.join(connection, {
    body: intruderJoinBody,
  });
  typia.assert(intruderAuth);

  const foreignGrantBody = {
    purpose_code: `marketing_${RandomGenerator.alphaNumeric(6)}`,
    purpose_name: "Marketing Emails",
    granted: true,
    policy_version: `v${RandomGenerator.alphaNumeric(4)}`,
    revoked_at: null,
    source: "web",
  } satisfies ITodoAppPrivacyConsent.ICreate;

  await TestValidator.error(
    "cannot create consent for a different user's account",
    async () => {
      await api.functional.todoApp.todoUser.users.privacyConsents.create(
        connection,
        {
          userId: ownerAuth.id, // intruder token active; path id is owner's id
          body: foreignGrantBody,
        },
      );
    },
  );
}
