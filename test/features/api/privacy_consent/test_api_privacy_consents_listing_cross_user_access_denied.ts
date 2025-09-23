import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppPrivacyConsent } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppPrivacyConsent";
import type { ITodoAppPrivacyConsent } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPrivacyConsent";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_privacy_consents_listing_cross_user_access_denied(
  connection: api.IConnection,
) {
  /**
   * Setup: create userB first to prepare data under their account. Token
   * context will become userB after this call.
   */
  const joinBodyB = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const userB = await api.functional.auth.todoUser.join(connection, {
    body: joinBodyB,
  });
  typia.assert(userB);

  /** Create a consent event under userB (owner-only operation). */
  const createConsentBodyB = {
    purpose_code: "analytics",
    purpose_name: RandomGenerator.paragraph({ sentences: 3 }),
    granted: true,
    policy_version: "v1.0",
    granted_at: new Date().toISOString(),
    source: "web",
  } satisfies ITodoAppPrivacyConsent.ICreate;
  const consentB =
    await api.functional.todoApp.todoUser.users.privacyConsents.create(
      connection,
      {
        userId: userB.id,
        body: createConsentBodyB,
      },
    );
  typia.assert(consentB);

  /** Positive control: userB lists their own consents successfully. */
  const listReqOwn = {
    page: 1,
    limit: 10,
  } satisfies ITodoAppPrivacyConsent.IRequest;
  const ownList =
    await api.functional.todoApp.todoUser.users.privacyConsents.index(
      connection,
      {
        userId: userB.id,
        body: listReqOwn,
      },
    );
  typia.assert(ownList);
  TestValidator.predicate(
    "owner (userB) can list at least one consent after creation",
    ownList.data.length >= 1,
  );

  /** Switch context to userA by joining a new account (SDK updates token). */
  const joinBodyA = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const userA = await api.functional.auth.todoUser.join(connection, {
    body: joinBodyA,
  });
  typia.assert(userA);

  /**
   * Cross-user denial: while authenticated as userA, attempt to list userB's
   * consents. Expect an authorization error (do not check specific status
   * code).
   */
  const listReqCross = {
    // minimal valid request body
  } satisfies ITodoAppPrivacyConsent.IRequest;
  await TestValidator.error(
    "cross-user listing must be denied (userA cannot list userB consents)",
    async () => {
      await api.functional.todoApp.todoUser.users.privacyConsents.index(
        connection,
        {
          userId: userB.id,
          body: listReqCross,
        },
      );
    },
  );
}
