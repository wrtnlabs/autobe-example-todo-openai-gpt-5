import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUser";

/**
 * Admin detail lookup: unknown id should fail, known id should succeed.
 *
 * Workflow
 *
 * 1. Register (join) a systemAdmin to establish an authenticated session.
 * 2. Control case: Request the admin's own user record using the systemAdmin
 *    detail endpoint and verify the response structure and identity match.
 * 3. Error case: Generate a different valid UUID that does not belong to the admin
 *    and attempt to fetch details; expect the call to throw (not-found
 *    semantics).
 *
 * Notes
 *
 * - Invalid UUID path parameter validation is excluded from E2E because DTO
 *   typing forbids such calls at compile time.
 * - Do not assert HTTP status codes or error messages; only assert that an error
 *   occurs.
 */
export async function test_api_user_admin_detail_not_found_for_unknown_id(
  connection: api.IConnection,
) {
  // 1) Register a system admin (also authenticates the connection via SDK)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, { body: joinBody });
  typia.assert(admin);

  // 2) Control: fetch existing user (the admin itself)
  const me: ITodoAppUser = await api.functional.todoApp.systemAdmin.users.at(
    connection,
    { userId: admin.id },
  );
  typia.assert(me);
  TestValidator.equals("fetched user should match admin id", me.id, admin.id);

  // 3) Error case: try an unknown UUID (ensure it's different from admin.id)
  let unknownId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();
  if (unknownId === admin.id) {
    // extremely unlikely collision; regenerate once deterministically
    unknownId = typia.random<string & tags.Format<"uuid">>();
  }

  await TestValidator.error(
    "unknown userId should not be found by systemAdmin",
    async () => {
      await api.functional.todoApp.systemAdmin.users.at(connection, {
        userId: unknownId,
      });
    },
  );
}
