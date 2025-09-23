import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { EOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/EOrderDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppBusinessEvent } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppBusinessEvent";
import type { ITodoAppBusinessEvent } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppBusinessEvent";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Verify that non-admin and unauthenticated callers are denied access to the
 * Business Events search endpoint.
 *
 * Context:
 *
 * - Business event logs are restricted to system administrators.
 * - A newly joined todoUser has no systemAdmin privileges.
 *
 * Steps:
 *
 * 1. Join as a todoUser to obtain an authenticated, non-admin context.
 * 2. Build a valid search request for business events.
 * 3. Call PATCH /todoApp/systemAdmin/businessEvents as the non-admin; expect
 *    denial.
 * 4. Create an unauthenticated connection and attempt the same call; expect
 *    denial.
 *
 * Notes:
 *
 * - Do not test specific HTTP status codes or error payloads; only verify that an
 *   error occurs.
 * - Do not manipulate connection.headers directly, except creating a clean
 *   unauthenticated clone.
 */
export async function test_api_business_events_authorization_restriction_non_admin_denied(
  connection: api.IConnection,
) {
  // 1) Register a non-admin todoUser and assert the authorization payload
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // 8~64 chars policy
  } satisfies ITodoAppTodoUser.ICreate;
  const member = await api.functional.auth.todoUser.join(connection, {
    body: joinBody,
  });
  typia.assert(member);

  // 2) Prepare a valid business events search request
  const searchBodyAuthenticated = {
    page: 1,
    limit: 10,
    sort: "occurred_at",
    direction: "desc",
    message_q: RandomGenerator.paragraph({ sentences: 3 }),
  } satisfies ITodoAppBusinessEvent.IRequest;

  // 3) As an authenticated non-admin, access must be denied
  await TestValidator.error(
    "authenticated non-admin must be denied to search business events",
    async () => {
      await api.functional.todoApp.systemAdmin.businessEvents.index(
        connection,
        { body: searchBodyAuthenticated },
      );
    },
  );

  // 4) Create an unauthenticated connection and expect denial
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  const searchBodyUnauthenticated = {
    page: 1,
    limit: 5,
  } satisfies ITodoAppBusinessEvent.IRequest;

  await TestValidator.error(
    "unauthenticated client must be denied to search business events",
    async () => {
      await api.functional.todoApp.systemAdmin.businessEvents.index(
        unauthConn,
        { body: searchBodyUnauthenticated },
      );
    },
  );
}
