import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { IEAdminStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAdminStatus";
import type { ITodoMvpAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdmin";
import type { ITodoMvpAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdminJoin";
import type { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";

/**
 * Ensure a regular user cannot access admin detail resource.
 *
 * Steps:
 *
 * 1. Register an admin to obtain a valid adminId and set admin token.
 * 2. Register a regular user; the SDK replaces Authorization with the user token.
 * 3. Attempt to GET /todoMvp/admin/admins/{adminId} with the user token and expect
 *    an error.
 * 4. Optional: Re-register an admin to switch context back to admin, then GET
 *    succeeds.
 *
 * Notes:
 *
 * - Use exact DTO variants for request bodies with `satisfies`.
 * - Do not check HTTP status codes; only assert that an error occurs for the
 *   user.
 * - Never touch connection.headers directly; token handling is managed by the
 *   SDK.
 */
export async function test_api_admin_account_detail_access_denied_to_user(
  connection: api.IConnection,
) {
  // 1) Register an admin to obtain target adminId
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8>>(),
  } satisfies ITodoMvpAdminJoin.ICreate;
  const adminAuth = await api.functional.auth.admin.join(connection, {
    body: adminJoinBody,
  });
  typia.assert(adminAuth);
  const targetAdminId = adminAuth.id; // string & tags.Format<"uuid">

  // 2) Register a regular user; this switches Authorization to the user token
  const userJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8>>(),
  } satisfies ITodoMvpUser.ICreate;
  const userAuth = await api.functional.auth.user.join(connection, {
    body: userJoinBody,
  });
  typia.assert(userAuth);

  // 3) Unauthorized access attempt by regular user
  await TestValidator.error(
    "regular user must not access admin detail",
    async () => {
      await api.functional.todoMvp.admin.admins.at(connection, {
        adminId: targetAdminId,
      });
    },
  );

  // 4) Optional success path: switch back to admin and verify access okay
  const adminJoinBody2 = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8>>(),
  } satisfies ITodoMvpAdminJoin.ICreate;
  const adminAuth2 = await api.functional.auth.admin.join(connection, {
    body: adminJoinBody2,
  });
  typia.assert(adminAuth2);

  const adminDetail = await api.functional.todoMvp.admin.admins.at(connection, {
    adminId: targetAdminId,
  });
  typia.assert(adminDetail);
  TestValidator.equals(
    "admin detail id should match target admin id",
    adminDetail.id,
    targetAdminId,
  );
}
