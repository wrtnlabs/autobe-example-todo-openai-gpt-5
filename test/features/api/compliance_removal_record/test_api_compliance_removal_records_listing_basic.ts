import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { IEAdminStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAdminStatus";
import type { IEComplianceReasonCode } from "@ORGANIZATION/PROJECT-api/lib/structures/IEComplianceReasonCode";
import type { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoMvpComplianceRemovalRecord } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoMvpComplianceRemovalRecord";
import type { ITodoMvpAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdmin";
import type { ITodoMvpAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdminJoin";
import type { ITodoMvpComplianceRemovalRecord } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpComplianceRemovalRecord";

/**
 * Basic admin-only listing of compliance removal records.
 *
 * Purpose: validate that an authenticated administrator can call PATCH
 * /todoMvp/admin/complianceRemovalRecords and receive a paginated container
 * even when there are no records or filters constrain results to empty sets.
 * Also validate that unauthenticated access is rejected.
 *
 * Steps
 *
 * 1. Admin join (obtain session)
 * 2. Minimal listing call with (page=1, limit=1, simple filter options)
 * 3. Validate pagination container and pages calculation
 * 4. Listing with a future-only date range; validate structure and that all
 *    returned records, if any, fall within range; assert data length <= limit
 * 5. RBAC check: unauthenticated call should error
 */
export async function test_api_compliance_removal_records_listing_basic(
  connection: api.IConnection,
) {
  // 1) Admin authentication (join)
  const adminAuth = await api.functional.auth.admin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoMvpAdminJoin.ICreate,
  });
  typia.assert(adminAuth);

  // 2) Minimal listing call (page=1, limit=1) with optional safe filters
  const listBody = {
    page: 1,
    limit: 1,
    sort_by: "created_at",
    order: "desc",
    reason_codes: ["policy_violation"],
  } satisfies ITodoMvpComplianceRemovalRecord.IRequest;

  const page1 =
    await api.functional.todoMvp.admin.complianceRemovalRecords.index(
      connection,
      { body: listBody },
    );
  typia.assert(page1);

  // 3) Business validation: pages should equal ceil(records/limit)
  const expectedPages1 = Math.ceil(
    page1.pagination.records / Math.max(1, page1.pagination.limit),
  );
  TestValidator.equals(
    "pages equals ceil(records/limit) on minimal listing",
    page1.pagination.pages,
    expectedPages1,
  );

  // 4) Future-only range filtering to likely produce empty/small result set
  const futureFrom = new Date(
    Date.now() + 365 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const futureTo = new Date(
    Date.now() + 2 * 365 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const filteredBody = {
    page: 1,
    limit: 1,
    sort_by: "action_effective_at",
    order: "asc",
    effective_from: futureFrom,
    effective_to: futureTo,
  } satisfies ITodoMvpComplianceRemovalRecord.IRequest;

  const pageFuture =
    await api.functional.todoMvp.admin.complianceRemovalRecords.index(
      connection,
      { body: filteredBody },
    );
  typia.assert(pageFuture);

  // If any records were returned, they must be within [futureFrom, futureTo]
  const minTs = new Date(futureFrom).getTime();
  const maxTs = new Date(futureTo).getTime();
  for (const rec of pageFuture.data) {
    const ts = new Date(rec.action_effective_at).getTime();
    TestValidator.predicate(
      "record action_effective_at within requested future range",
      minTs <= ts && ts <= maxTs,
    );
  }
  TestValidator.predicate(
    "data length should not exceed requested limit",
    pageFuture.data.length <= filteredBody.limit!,
  );

  // 5) RBAC: unauthenticated connection must fail
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated access to admin listing should fail",
    async () => {
      await api.functional.todoMvp.admin.complianceRemovalRecords.index(
        unauthConn,
        {
          body: {
            page: 1,
            limit: 1,
          } satisfies ITodoMvpComplianceRemovalRecord.IRequest,
        },
      );
    },
  );
}
