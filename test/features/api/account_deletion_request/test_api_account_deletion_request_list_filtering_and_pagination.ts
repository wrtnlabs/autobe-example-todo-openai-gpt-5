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
 * Validate that an authenticated todoUser can list their account deletion
 * requests with filtering and pagination, ensuring default sorting and boundary
 * validations.
 *
 * Steps:
 *
 * 1. Register (join) a todoUser and capture authorized id
 * 2. Seed two account deletion requests for this user
 * 3. List with filters: page=1, limit=20, status=pending_confirmation, created_at
 *    window covering now ±1 hour, relying on default sort
 * 4. Validate:
 *
 *    - Response typing
 *    - Pagination metadata
 *    - Items match status and created_at range
 *    - Sorted by created_at desc
 *    - Seeded IDs included in results
 * 5. Negative: limit=1000 should raise validation error
 */
export async function test_api_account_deletion_request_list_filtering_and_pagination(
  connection: api.IConnection,
) {
  // 1) Authenticate by joining as new todoUser
  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: typia.random<
          string & tags.MinLength<8> & tags.MaxLength<64>
        >(),
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(authorized);

  // 2) Seed: create two account deletion requests for this user
  const createBody1 = {
    reason: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ITodoAppAccountDeletionRequest.ICreate;
  const req1: ITodoAppAccountDeletionRequest =
    await api.functional.todoApp.todoUser.users.accountDeletionRequests.create(
      connection,
      {
        userId: authorized.id,
        body: createBody1,
      },
    );
  typia.assert(req1);

  const createBody2 = {
    reason: RandomGenerator.paragraph({ sentences: 6 }),
  } satisfies ITodoAppAccountDeletionRequest.ICreate;
  const req2: ITodoAppAccountDeletionRequest =
    await api.functional.todoApp.todoUser.users.accountDeletionRequests.create(
      connection,
      {
        userId: authorized.id,
        body: createBody2,
      },
    );
  typia.assert(req2);

  // 3) List with filters (now ±1 hour)
  const now = Date.now();
  const from = new Date(now - 60 * 60 * 1000).toISOString();
  const to = new Date(now + 60 * 60 * 1000).toISOString();

  const page1: IPageITodoAppAccountDeletionRequest.ISummary =
    await api.functional.todoApp.todoUser.accountDeletionRequests.index(
      connection,
      {
        body: {
          page: 1,
          limit: 20,
          status: "pending_confirmation",
          created_at_from: from,
          created_at_to: to,
        } satisfies ITodoAppAccountDeletionRequest.IRequest,
      },
    );
  typia.assert(page1);

  // 4) Validations
  // 4-1) Pagination metadata
  TestValidator.equals(
    "pagination current equals requested page",
    page1.pagination.current,
    1,
  );
  TestValidator.equals(
    "pagination limit equals requested limit",
    page1.pagination.limit,
    20,
  );
  TestValidator.predicate(
    "total records should be >= number of seeded requests",
    page1.pagination.records >= 2,
  );

  // 4-2) Items adhere to filters
  const fromTime = Date.parse(from);
  const toTime = Date.parse(to);
  TestValidator.predicate(
    "all items have status pending_confirmation",
    page1.data.every((d) => d.status === "pending_confirmation"),
  );
  TestValidator.predicate(
    "all items have created_at within [from, to] inclusive",
    page1.data.every((d) => {
      const t = Date.parse(d.created_at);
      return fromTime <= t && t <= toTime;
    }),
  );

  // 4-3) Default sorting: created_at desc (non-increasing)
  TestValidator.predicate(
    "results are ordered by created_at descending",
    page1.data.every((d, i, arr) =>
      i === 0
        ? true
        : Date.parse(arr[i - 1].created_at) >= Date.parse(d.created_at),
    ),
  );

  // 4-4) Seeded IDs are included in the listing
  const listedIds = page1.data.map((d) => d.id);
  TestValidator.predicate(
    "first seeded request is present",
    listedIds.includes(req1.id),
  );
  TestValidator.predicate(
    "second seeded request is present",
    listedIds.includes(req2.id),
  );

  // 5) Negative validation: limit beyond max should fail
  await TestValidator.error(
    "limit greater than 100 should raise validation error",
    async () => {
      await api.functional.todoApp.todoUser.accountDeletionRequests.index(
        connection,
        {
          body: {
            page: 1,
            limit: 1000, // beyond allowed maximum 100
          } satisfies ITodoAppAccountDeletionRequest.IRequest,
        },
      );
    },
  );
}
