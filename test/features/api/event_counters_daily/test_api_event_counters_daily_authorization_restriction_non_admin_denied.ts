import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppEventCountersDaily } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppEventCountersDaily";
import type { ITodoAppEventCountersDaily } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEventCountersDaily";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Authorization restriction: Non-admin user cannot access daily event counters;
 * unauthenticated requests are rejected.
 *
 * Business context:
 *
 * - The daily event counters endpoint under systemAdmin is restricted to
 *   administrative users because it exposes system analytics. Regular todoUser
 *   accounts must be denied.
 *
 * Test steps:
 *
 * 1. Register and authenticate a regular todoUser via /auth/todoUser/join.
 * 2. Attempt PATCH /todoApp/systemAdmin/eventCountersDaily with minimal request
 *    body while authenticated as todoUser → expect error.
 * 3. Create an unauthenticated connection (no Authorization header) and retry the
 *    same request → expect error.
 *
 * Validation strategy:
 *
 * - Use typia.assert on the join response to ensure correct authorization DTO.
 * - Use TestValidator.error with async callbacks (and await) to confirm denials
 *   without asserting HTTP status codes or error payloads.
 */
export async function test_api_event_counters_daily_authorization_restriction_non_admin_denied(
  connection: api.IConnection,
) {
  // 1) Register and authenticate a regular todoUser
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const authorized: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBody });
  typia.assert(authorized);

  // Minimal request body for admin endpoint (all fields optional)
  const minimalRequest = {
    // Intentionally empty to represent minimal filters
  } satisfies ITodoAppEventCountersDaily.IRequest;

  // 2) Authenticated as non-admin (todoUser): expect authorization error
  await TestValidator.error(
    "non-admin caller must be denied for system admin daily counters",
    async () => {
      await api.functional.todoApp.systemAdmin.eventCountersDaily.index(
        connection,
        { body: minimalRequest },
      );
    },
  );

  // 3) Unauthenticated connection (no Authorization header): expect error
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "missing Authorization header must be denied for daily counters",
    async () => {
      await api.functional.todoApp.systemAdmin.eventCountersDaily.index(
        unauthConn,
        { body: minimalRequest },
      );
    },
  );
}
