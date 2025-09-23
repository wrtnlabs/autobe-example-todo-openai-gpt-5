import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppAccountStatusChange } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAccountStatusChange";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Ensure non-existent account status change detail returns not-found style
 * error.
 *
 * Purpose
 *
 * - Verify that a system admin requesting details for an unknown
 *   accountStatusChangeId results in an error (not-found style) without leaking
 *   details, and that repeated requests remain idempotently not found.
 *
 * Steps
 *
 * 1. Register (authenticate) as system admin using /auth/systemAdmin/join.
 * 2. Prepare a valid UUID that should not exist (NIL UUID) as the target id.
 * 3. Call GET /todoApp/systemAdmin/accountStatusChanges/{accountStatusChangeId}
 *    and expect an error.
 * 4. Repeat the same GET call with the same UUID and again expect an error to
 *    validate idempotent behavior.
 */
export async function test_api_account_status_change_detail_not_found(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: typia.random<ITodoAppSystemAdminJoin.ICreate>(),
    });
  typia.assert(admin);

  // 2) Prepare a valid UUID that should not exist (NIL UUID)
  const unknownId = typia.assert<string & tags.Format<"uuid">>(
    "00000000-0000-0000-0000-000000000000",
  );

  // 3) Expect error for unknown id
  await TestValidator.error(
    "non-existent account status change should raise error",
    async () => {
      await api.functional.todoApp.systemAdmin.accountStatusChanges.at(
        connection,
        { accountStatusChangeId: unknownId },
      );
    },
  );

  // 4) Idempotency: repeat the same request, expect error again
  await TestValidator.error(
    "repeating request for same unknown id remains error",
    async () => {
      await api.functional.todoApp.systemAdmin.accountStatusChanges.at(
        connection,
        { accountStatusChangeId: unknownId },
      );
    },
  );
}
