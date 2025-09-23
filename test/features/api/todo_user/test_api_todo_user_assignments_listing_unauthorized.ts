import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppTodoUser";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Ensure unauthorized access is rejected for admin-only todoUser assignments
 * listing.
 *
 * This test verifies that the system-admin endpoint for listing a user's
 * todoUser role assignment history strictly enforces authorization rules.
 *
 * Flow:
 *
 * 1. Create a regular todoUser via join to get a valid userId (and a non-admin
 *    token).
 * 2. Attempt to call the admin-only listing endpoint without any token (new
 *    connection with empty headers) → must fail.
 * 3. Attempt to call the admin-only listing endpoint with a non-admin todoUser
 *    token (the connection mutated by join) → must fail.
 *
 * Notes:
 *
 * - We do not check specific HTTP status codes; only that an error occurs.
 * - Request body for listing uses an empty filter object to isolate authorization
 *   behavior.
 */
export async function test_api_todo_user_assignments_listing_unauthorized(
  connection: api.IConnection,
) {
  // 1) Create a regular todoUser to obtain a valid userId
  const joinOutput = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphabets(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(joinOutput);

  const userId = joinOutput.id; // UUID of the newly created user

  // Prepare a minimal request body (all fields optional) for the listing API
  const emptyRequest = {} satisfies ITodoAppTodoUser.IRequest;

  // 2) Unauthenticated request (no headers)
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated caller cannot list a user's todoUser assignments",
    async () => {
      await api.functional.todoApp.systemAdmin.users.todoUsers.index(
        unauthConn,
        {
          userId,
          body: emptyRequest,
        },
      );
    },
  );

  // 3) Authenticated as non-admin (todoUser) must also be rejected
  await TestValidator.error(
    "non-admin todoUser cannot list a user's todoUser assignments",
    async () => {
      await api.functional.todoApp.systemAdmin.users.todoUsers.index(
        connection,
        {
          userId,
          body: emptyRequest,
        },
      );
    },
  );
}
