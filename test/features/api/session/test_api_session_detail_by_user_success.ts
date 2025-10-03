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
 * Retrieve the authenticated user's session details by sessionId.
 *
 * Steps:
 *
 * 1. Join as a new user to establish authentication and create an initial session.
 * 2. List the caller's sessions with pagination (page=1, limit=10) and
 *    state="all".
 * 3. Pick a valid sessionId (prefer the session bound to the joined user).
 * 4. GET the session detail by the chosen sessionId.
 * 5. Validate response types and ownership references.
 */
export async function test_api_session_detail_by_user_success(
  connection: api.IConnection,
) {
  // 1) Register a new user (also establishes an authenticated session)
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12); // >= 8 chars

  const authorized = await api.functional.auth.user.join(connection, {
    body: {
      email,
      password,
    } satisfies ITodoMvpUser.ICreate,
  });
  typia.assert(authorized);

  // 2) List sessions for the authenticated user (deterministic listing request)
  const page = await api.functional.todoMvp.user.sessions.index(connection, {
    body: {
      page: 1,
      limit: 10,
      state: "all",
      sort_by: "last_accessed_at",
      order: "desc",
    } satisfies ITodoMvpSession.IRequest,
  });
  typia.assert(page);

  await TestValidator.predicate(
    "sessions listing should have at least one item",
    async () => page.data.length > 0,
  );

  // 3) Pick a session: prefer one owned by the joined user, fallback to first
  const candidate =
    page.data.find((s) => s.todo_mvp_user_id === authorized.id) ?? page.data[0];
  // Ensure candidate is a valid ITodoMvpSession
  typia.assertGuard<ITodoMvpSession>(candidate);

  // 4) Retrieve detail by sessionId
  const detail = await api.functional.todoMvp.user.sessions.at(connection, {
    sessionId: candidate.id,
  });
  typia.assert(detail);

  // 5) Business validations
  TestValidator.equals(
    "detail.id should equal the chosen session id from listing",
    detail.id,
    candidate.id,
  );

  // Ownership references
  TestValidator.predicate(
    "detail.todo_mvp_user_id must be present (user-owned session)",
    detail.todo_mvp_user_id !== null && detail.todo_mvp_user_id !== undefined,
  );
  if (
    detail.todo_mvp_user_id !== null &&
    detail.todo_mvp_user_id !== undefined
  ) {
    TestValidator.equals(
      "detail.todo_mvp_user_id should match the joined user's id",
      detail.todo_mvp_user_id,
      authorized.id,
    );
  }
  TestValidator.equals(
    "detail.todo_mvp_admin_id must be null (not an admin session)",
    detail.todo_mvp_admin_id ?? null,
    null,
  );
}
