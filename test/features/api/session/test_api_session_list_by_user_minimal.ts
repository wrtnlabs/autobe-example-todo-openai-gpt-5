import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import type { IESessionSortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IESessionSortBy";
import type { IESessionState } from "@ORGANIZATION/PROJECT-api/lib/structures/IESessionState";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoMvpSession } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoMvpSession";
import type { ITodoMvpSession } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpSession";
import type { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";

/**
 * Minimal authenticated session listing by user.
 *
 * Business context:
 *
 * - A new member registers, which also creates an authenticated session.
 * - Using the authenticated context, request a minimal session listing to verify
 *   ownership scoping and basic pagination/timestamp logic.
 *
 * Steps:
 *
 * 1. Register a fresh user (email + password) via auth join API
 * 2. Call user session listing with minimal request body (page, limit, state,
 *    sort)
 * 3. Validate page container shape and that all sessions belong to the user
 * 4. Validate basic timestamp monotonicity and pagination consistency
 */
export async function test_api_session_list_by_user_minimal(
  connection: api.IConnection,
) {
  // 1) Register a fresh user and obtain authenticated context
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12); // >= 8 chars

  const authorized: ITodoMvpUser.IAuthorized =
    await api.functional.auth.user.join(connection, {
      body: {
        email,
        password,
      } satisfies ITodoMvpUser.ICreate,
    });
  typia.assert(authorized);

  // Optional sanity: if provider includes user profile, ensure subject alignment
  if (authorized.user !== undefined) {
    TestValidator.equals(
      "authorized.user.id equals subject id",
      authorized.user.id,
      authorized.id,
    );
    TestValidator.equals(
      "authorized.user.email equals subject email",
      authorized.user.email,
      authorized.email,
    );
  }

  // 2) Call session listing with minimal, explicit request
  const requestBody = {
    page: 1,
    limit: 10,
    state: "all",
    sort_by: "last_accessed_at",
    order: "desc",
  } satisfies ITodoMvpSession.IRequest;

  const page: IPageITodoMvpSession =
    await api.functional.todoMvp.user.sessions.index(connection, {
      body: requestBody,
    });
  typia.assert(page);

  // 3) Business validations (no type checks beyond typia.assert)
  TestValidator.predicate(
    "sessions list should contain at least one session",
    page.data.length >= 1,
  );

  TestValidator.predicate(
    "all sessions are owned by the authenticated user",
    page.data.every(
      (s) =>
        s.todo_mvp_user_id === authorized.id &&
        (s.todo_mvp_admin_id === null || s.todo_mvp_admin_id === undefined),
    ),
  );

  // 4) Timestamp monotonicity within each session
  TestValidator.predicate(
    "session timestamps are ordered: created_at <= updated_at and created_at <= last_accessed_at",
    page.data.every((s) => {
      const created = new Date(s.created_at).getTime();
      const updated = new Date(s.updated_at).getTime();
      const accessed = new Date(s.last_accessed_at).getTime();
      return created <= updated && created <= accessed;
    }),
  );

  // 5) Basic pagination coherence within a single page
  TestValidator.predicate(
    "data length does not exceed pagination.limit",
    page.data.length <= page.pagination.limit,
  );

  // 6) Uniqueness sanity for listed IDs within the page (not a type check)
  const uniqueIds = new Set(page.data.map((s) => s.id));
  TestValidator.equals(
    "session ids are unique within the page",
    uniqueIds.size,
    page.data.length,
  );
}
