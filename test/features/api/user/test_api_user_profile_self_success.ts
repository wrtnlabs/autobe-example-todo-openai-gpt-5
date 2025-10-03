import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";

/**
 * Retrieve self profile after user registration (happy path).
 *
 * Purpose:
 *
 * - Register a new member account, then immediately fetch the member's own user
 *   profile by ID to verify identity consistency and timestamp coherence.
 *
 * Steps:
 *
 * 1. Join as a new user (email + password≥8) using api.functional.auth.user.join.
 * 2. Extract authorized.id from ITodoMvpUser.IAuthorized.
 * 3. Call api.functional.todoMvp.user.users.at with the userId.
 * 4. Validate:
 *
 *    - Response types via typia.assert.
 *    - Profile.id === authorized.id
 *    - Profile.email === authorized.email
 *    - Profile.status === authorized.status
 *    - Updated_at >= created_at (temporal coherence)
 *    - If authorized.user is present, its identity matches the fetched profile
 */
export async function test_api_user_profile_self_success(
  connection: api.IConnection,
) {
  // 1) Register a new member
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12); // ≥ 8 chars
  const joinBody = {
    email,
    password,
  } satisfies ITodoMvpUser.ICreate;

  const authorized = await api.functional.auth.user.join(connection, {
    body: joinBody,
  });
  typia.assert<ITodoMvpUser.IAuthorized>(authorized);

  // 2) Retrieve self profile by authorized.id
  const profile = await api.functional.todoMvp.user.users.at(connection, {
    userId: authorized.id,
  });
  typia.assert<ITodoMvpUser>(profile);

  // 3) Identity consistency checks
  TestValidator.equals(
    "profile id matches authorized id",
    profile.id,
    authorized.id,
  );
  TestValidator.equals(
    "profile email matches authorized email",
    profile.email,
    authorized.email,
  );
  TestValidator.equals(
    "profile status matches authorized status",
    profile.status,
    authorized.status,
  );

  // 4) Temporal coherence: updated_at should not be earlier than created_at
  const createdMs = Date.parse(profile.created_at);
  const updatedMs = Date.parse(profile.updated_at);
  TestValidator.predicate(
    "updated_at is same or after created_at",
    updatedMs >= createdMs,
  );

  // 5) Optional convenience user in authorization payload should match, if present
  if (authorized.user !== undefined) {
    typia.assert<ITodoMvpUser>(authorized.user);
    TestValidator.equals(
      "authorized.user.id equals profile id",
      authorized.user.id,
      profile.id,
    );
    TestValidator.equals(
      "authorized.user.email equals profile email",
      authorized.user.email,
      profile.email,
    );
    TestValidator.equals(
      "authorized.user.status equals profile status",
      authorized.user.status,
      profile.status,
    );
  }
}
