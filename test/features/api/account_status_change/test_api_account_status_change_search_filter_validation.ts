import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppAccountStatusChange } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppAccountStatusChange";
import type { ITodoAppAccountStatusChange } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAccountStatusChange";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Validate admin-only account status change search filter validation.
 *
 * This test verifies that the system enforces validation on search filters for
 * account status change history while using only type-correct inputs.
 *
 * Steps:
 *
 * 1. Create a regular todoUser to obtain a valid target_user_id for filtering.
 * 2. Create a systemAdmin account to acquire admin context (Authorization switches
 *    automatically).
 * 3. Perform a valid search with minimal filters and assert response typing; if
 *    any data exists, it should match the target_user_id filter.
 * 4. Error case A: created_at_from > created_at_to (both valid ISO strings) →
 *    expect an error.
 * 5. Error case B: Pagination outside allowed range (page = 0, limit = 1000) →
 *    expect an error.
 * 6. Error case C: Combine reversed date range and out-of-range limit → expect an
 *    error.
 */
export async function test_api_account_status_change_search_filter_validation(
  connection: api.IConnection,
) {
  // 1) Create a member todoUser (obtain target_user_id)
  const member = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphabets(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(member);
  const targetUserId = member.id;

  // 2) Create a systemAdmin (switch context to admin)
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphabets(12),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 3) Happy path: valid search with basic filters
  const validPage =
    await api.functional.todoApp.systemAdmin.accountStatusChanges.index(
      connection,
      {
        body: {
          page: 1,
          limit: 10,
          orderBy: "created_at",
          orderDirection: "desc",
          target_user_id: targetUserId,
        } satisfies ITodoAppAccountStatusChange.IRequest,
      },
    );
  typia.assert(validPage);
  // Business logic check: when data exists, all should match target_user_id
  TestValidator.predicate("valid results respect target_user_id filter", () =>
    validPage.data.every((r) => r.target_user_id === targetUserId),
  );

  // Prepare date range values
  const earlierIso = new Date(Date.now() - 1000 * 60 * 60).toISOString();
  const laterIso = new Date().toISOString();

  // 4) Error case A: reversed date range (from > to) → expect error
  await TestValidator.error(
    "rejects reversed created_at range (from > to)",
    async () => {
      await api.functional.todoApp.systemAdmin.accountStatusChanges.index(
        connection,
        {
          body: {
            page: 1,
            limit: 10,
            target_user_id: targetUserId,
            created_at_from: laterIso,
            created_at_to: earlierIso,
          } satisfies ITodoAppAccountStatusChange.IRequest,
        },
      );
    },
  );

  // 5) Error case B: pagination outside allowed range → expect error
  await TestValidator.error(
    "rejects out-of-range pagination values (page=0, limit=1000)",
    async () => {
      await api.functional.todoApp.systemAdmin.accountStatusChanges.index(
        connection,
        {
          body: {
            page: 0,
            limit: 1000,
            target_user_id: targetUserId,
          } satisfies ITodoAppAccountStatusChange.IRequest,
        },
      );
    },
  );

  // 6) Error case C: combined invalids → expect error
  await TestValidator.error(
    "rejects combined invalid filters (reversed range + limit too large)",
    async () => {
      await api.functional.todoApp.systemAdmin.accountStatusChanges.index(
        connection,
        {
          body: {
            page: 0,
            limit: 1000,
            target_user_id: targetUserId,
            created_at_from: laterIso,
            created_at_to: earlierIso,
          } satisfies ITodoAppAccountStatusChange.IRequest,
        },
      );
    },
  );
}
