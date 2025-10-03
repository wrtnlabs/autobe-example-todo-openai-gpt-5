import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { IEAdminStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAdminStatus";
import type { ITodoMvpAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdmin";
import type { ITodoMvpAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdminJoin";

export async function test_api_admin_registration_duplicate_email_conflict(
  connection: api.IConnection,
) {
  /**
   * Validate duplicate email conflict on admin registration.
   *
   * Steps:
   *
   * 1. Register a new admin with a random email/password -> success and token
   *    issuance
   * 2. Try registering again with the same email -> expect failure (duplicate
   *    email)
   *
   * Notes:
   *
   * - Do not inspect HTTP status codes; only assert that an error occurs.
   * - Do not touch connection headers; SDK manages tokens automatically.
   */

  // 1) Successful registration
  const email = typia.random<string & tags.Format<"email">>();
  const password = typia.random<string & tags.MinLength<8>>();
  const firstBody = {
    email,
    password,
  } satisfies ITodoMvpAdminJoin.ICreate;

  const first = await api.functional.auth.admin.join(connection, {
    body: firstBody,
  });
  typia.assert(first);

  // Basic business validation: returned email echoes input
  TestValidator.equals(
    "joined email must equal request email",
    first.email,
    email,
  );

  // 2) Duplicate registration attempt with the same email must fail
  const secondBody = {
    email,
    password: typia.random<string & tags.MinLength<8>>(),
  } satisfies ITodoMvpAdminJoin.ICreate;

  await TestValidator.error(
    "duplicate admin email must be rejected",
    async () => {
      await api.functional.auth.admin.join(connection, {
        body: secondBody,
      });
    },
  );
}
