import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import type { IESessionSortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IESessionSortBy";
import type { IESessionState } from "@ORGANIZATION/PROJECT-api/lib/structures/IESessionState";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoMvpSession } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoMvpSession";
import type { ITodoMvpSession } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpSession";

/**
 * Verify unauthenticated access is rejected for session listing.
 *
 * Business context:
 *
 * - The /todoMvp/user/sessions endpoint is authenticated and must scope results
 *   to the caller. Unauthenticated calls must be rejected and must not return
 *   any session data.
 *
 * Test steps:
 *
 * 1. Create an unauthenticated connection by copying the given connection and
 *    setting headers to an empty object (no Authorization). Do not mutate the
 *    original connection headers.
 * 2. Prepare a minimal, valid request body (all fields in ITodoMvpSession.IRequest
 *    are optional). Use an empty object literal with `satisfies`.
 * 3. Call sessions.index with the unauthenticated connection and expect the call
 *    to fail using TestValidator.error. Do not assert specific HTTP status
 *    codes or error messages.
 */
export async function test_api_session_list_unauthorized(
  connection: api.IConnection,
) {
  // 1) Build an unauthenticated connection (no Authorization header)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 2) Minimal valid request body for listing sessions (all fields optional)
  const requestBody = {} satisfies ITodoMvpSession.IRequest;

  // 3) Expect rejection due to missing authentication
  await TestValidator.error(
    "unauthenticated client cannot list sessions",
    async () => {
      await api.functional.todoMvp.user.sessions.index(unauthConn, {
        body: requestBody,
      });
    },
  );
}
