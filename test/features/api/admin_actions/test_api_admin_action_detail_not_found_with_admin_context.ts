import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppAdminAction } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAdminAction";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Admin action detail: not-found behavior under admin context.
 *
 * This test ensures that an authenticated system administrator attempting to
 * fetch details of a non-existent administrative action receives a proper error
 * (not-found semantics) without data leakage.
 *
 * Steps:
 *
 * 1. Register (join) as a system administrator to obtain an authorized context
 *    with SDK-managed token.
 * 2. Call the detail endpoint with a random valid UUID that should not exist.
 *
 * Validations:
 *
 * - Join returns an authorized payload (type-validated via typia.assert).
 * - Detail request for a random UUID results in an error (asserted with
 *   TestValidator.error). No specific HTTP status or message checks are made.
 */
export async function test_api_admin_action_detail_not_found_with_admin_context(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin via join to get authorized context
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppSystemAdminJoin.ICreate;

  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: joinBody,
    });
  typia.assert(admin);

  // 2) Request details for a random non-existent admin action id and expect error
  const randomId = typia.random<string & tags.Format<"uuid">>();
  await TestValidator.error(
    "admin action detail should not be retrievable for random UUID under admin auth",
    async () => {
      await api.functional.todoApp.systemAdmin.adminActions.at(connection, {
        adminActionId: randomId,
      });
    },
  );
}
