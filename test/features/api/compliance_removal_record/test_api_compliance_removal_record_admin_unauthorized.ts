import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IEComplianceReasonCode } from "@ORGANIZATION/PROJECT-api/lib/structures/IEComplianceReasonCode";
import type { ITodoMvpComplianceRemovalRecord } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpComplianceRemovalRecord";

/**
 * Deny unauthenticated access to admin-only compliance removal records.
 *
 * Business purpose:
 *
 * - Ensure that administrative audit/oversight records cannot be retrieved
 *   without proper admin authentication. This prevents information exposure
 *   about compliance actions.
 *
 * What this validates:
 *
 * 1. Unauthenticated request to GET /todoMvp/admin/complianceRemovalRecords/{id}
 *    results in an authorization error (no success response is returned).
 * 2. We do not validate specific HTTP status codes; only that an error occurs.
 *
 * Steps:
 *
 * - Create an unauthenticated connection by cloning the given connection with
 *   empty headers (allowed pattern for unauthenticated calls).
 * - Call the endpoint with a valid UUID.
 * - Assert that the call throws using TestValidator.error (async variant).
 */
export async function test_api_compliance_removal_record_admin_unauthorized(
  connection: api.IConnection,
) {
  // Prepare an unauthenticated connection (do not manipulate headers afterwards)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // Attempt to access admin-only resource without authentication
  await TestValidator.error(
    "admin-only compliance removal record retrieval must fail without auth",
    async () => {
      await api.functional.todoMvp.admin.complianceRemovalRecords.at(
        unauthConn,
        {
          complianceRemovalRecordId: typia.random<
            string & tags.Format<"uuid">
          >(),
        },
      );
    },
  );
}
