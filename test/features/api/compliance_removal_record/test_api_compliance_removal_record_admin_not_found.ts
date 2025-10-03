import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { IEAdminStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAdminStatus";
import type { IEComplianceReasonCode } from "@ORGANIZATION/PROJECT-api/lib/structures/IEComplianceReasonCode";
import type { ITodoMvpAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdmin";
import type { ITodoMvpAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdminJoin";
import type { ITodoMvpComplianceRemovalRecord } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpComplianceRemovalRecord";

/**
 * Admin tries to fetch a non-existent compliance removal record by UUID.
 *
 * Business purpose:
 *
 * - Ensure admin-only retrieval endpoint behaves with generic not-found semantics
 *   for well-formed but unknown IDs, without exposing extra details.
 *
 * Steps:
 *
 * 1. Join as a fresh admin to establish authentication (SDK manages token).
 * 2. Call GET /todoMvp/admin/complianceRemovalRecords/{id} with a random UUID that
 *    should not exist and assert that an error occurs.
 *
 * Important notes:
 *
 * - Do not validate specific HTTP status codes; only assert that an error is
 *   thrown.
 * - Do not touch connection.headers; rely on SDK after join.
 */
export async function test_api_compliance_removal_record_admin_not_found(
  connection: api.IConnection,
) {
  // 1) Admin bootstrap (join) to obtain an authenticated session
  const authorized = await api.functional.auth.admin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12), // >= 8 chars as required
    } satisfies ITodoMvpAdminJoin.ICreate,
  });
  typia.assert(authorized);

  // 2) Attempt to read a non-existent compliance removal record
  const unknownId = typia.random<string & tags.Format<"uuid">>();
  await TestValidator.error(
    "admin fetching non-existent compliance removal record should error",
    async () => {
      await api.functional.todoMvp.admin.complianceRemovalRecords.at(
        connection,
        { complianceRemovalRecordId: unknownId },
      );
    },
  );
}
