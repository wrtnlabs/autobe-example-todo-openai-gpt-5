import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppAccountDeletionRequest } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppAccountDeletionRequest";
import type { ITodoAppAccountDeletionRequest } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAccountDeletionRequest";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * List a todoUser's account deletion requests with filters and pagination.
 *
 * Workflow
 *
 * 1. Register and authenticate a todoUser to obtain userId and token
 * 2. Create two account deletion requests with distinct reasons ("alpha", "beta")
 * 3. List requests without filters (but explicitly sorted by created_at desc, and
 *    ample limit)
 *
 *    - Validate both created entries appear
 *    - Validate non-increasing ordering by created_at
 *    - Validate pagination metadata basic consistency
 * 4. Apply filters (status == initial status, created_at window, q substring
 *    "beta")
 *
 *    - Validate exactly one entry is returned and it matches the second request
 * 5. Paginate with limit=1 across pages 1 and 2 to ensure deterministic order and
 *    no duplicates
 */
export async function test_api_account_deletion_requests_listing_basic_filters_pagination(
  connection: api.IConnection,
) {
  // 1) Authenticate as a new todoUser
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const auth = await api.functional.auth.todoUser.join(connection, {
    body: joinBody,
  });
  typia.assert(auth);
  const userId = auth.id;

  // 2) Create two deletion requests with distinct reasons
  const reason1 = `alpha ${RandomGenerator.paragraph({ sentences: 6 })}`;
  const reason2 = `beta ${RandomGenerator.paragraph({ sentences: 6 })}`;

  const created1 =
    await api.functional.todoApp.todoUser.users.accountDeletionRequests.create(
      connection,
      {
        userId,
        body: {
          reason: reason1,
        } satisfies ITodoAppAccountDeletionRequest.ICreate,
      },
    );
  typia.assert(created1);

  const created2 =
    await api.functional.todoApp.todoUser.users.accountDeletionRequests.create(
      connection,
      {
        userId,
        body: {
          reason: reason2,
        } satisfies ITodoAppAccountDeletionRequest.ICreate,
      },
    );
  typia.assert(created2);

  const statusFilter: string = created1.status;
  const from =
    created1.created_at <= created2.created_at
      ? created1.created_at
      : created2.created_at;
  const to =
    created1.created_at >= created2.created_at
      ? created1.created_at
      : created2.created_at;

  // 3) List without filters (explicit sort by created_at desc for determinism)
  const pageAll =
    await api.functional.todoApp.todoUser.users.accountDeletionRequests.index(
      connection,
      {
        userId,
        body: {
          page: 1 satisfies number as number,
          limit: 10 satisfies number as number,
          order_by: "created_at",
          order_dir: "desc",
        } satisfies ITodoAppAccountDeletionRequest.IRequest,
      },
    );
  typia.assert(pageAll);

  const allIds = pageAll.data.map((s) => s.id);
  TestValidator.predicate(
    "listing includes first created request",
    allIds.includes(created1.id),
  );
  TestValidator.predicate(
    "listing includes second created request",
    allIds.includes(created2.id),
  );

  // Validate non-increasing created_at ordering
  const sortedDesc = pageAll.data.every(
    (cur, idx, arr) => idx === 0 || arr[idx - 1].created_at >= cur.created_at,
  );
  TestValidator.predicate(
    "results sorted by created_at desc (non-increasing)",
    sortedDesc,
  );

  // Basic pagination integrity checks
  TestValidator.predicate(
    "pagination.records >= data length",
    pageAll.pagination.records >= pageAll.data.length,
  );
  TestValidator.predicate(
    "pagination.pages >= 1",
    pageAll.pagination.pages >= 1,
  );
  TestValidator.equals(
    "pagination.limit echoes requested limit",
    pageAll.pagination.limit,
    10,
  );

  // 4) Apply filters: status, created_at window, reason substring (beta)
  const filtered =
    await api.functional.todoApp.todoUser.users.accountDeletionRequests.index(
      connection,
      {
        userId,
        body: {
          page: 1 satisfies number as number,
          limit: 10 satisfies number as number,
          status: statusFilter,
          created_at_from: from,
          created_at_to: to,
          q: "beta",
          order_by: "created_at",
          order_dir: "desc",
        } satisfies ITodoAppAccountDeletionRequest.IRequest,
      },
    );
  typia.assert(filtered);

  TestValidator.equals("filtered result length == 1", filtered.data.length, 1);
  if (filtered.data.length > 0) {
    TestValidator.equals(
      "filtered result is the second request",
      filtered.data[0].id,
      created2.id,
    );
  }

  // 5) Pagination with limit=1 across pages 1 and 2
  const pageOne =
    await api.functional.todoApp.todoUser.users.accountDeletionRequests.index(
      connection,
      {
        userId,
        body: {
          page: 1 satisfies number as number,
          limit: 1 satisfies number as number,
          order_by: "created_at",
          order_dir: "desc",
        } satisfies ITodoAppAccountDeletionRequest.IRequest,
      },
    );
  typia.assert(pageOne);

  const pageTwo =
    await api.functional.todoApp.todoUser.users.accountDeletionRequests.index(
      connection,
      {
        userId,
        body: {
          page: 2 satisfies number as number,
          limit: 1 satisfies number as number,
          order_by: "created_at",
          order_dir: "desc",
        } satisfies ITodoAppAccountDeletionRequest.IRequest,
      },
    );
  typia.assert(pageTwo);

  if (pageOne.data.length > 0 && pageTwo.data.length > 0) {
    TestValidator.notEquals(
      "page 1 and page 2 items are different",
      pageOne.data[0].id,
      pageTwo.data[0].id,
    );
    TestValidator.predicate(
      "page1 item is not older than page2 item (desc order)",
      pageOne.data[0].created_at >= pageTwo.data[0].created_at,
    );
  }
}
