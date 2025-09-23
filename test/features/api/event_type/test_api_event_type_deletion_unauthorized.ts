import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEventType";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Verify that deleting an event type without authentication is rejected and the
 * record remains, by then successfully deleting it with an authenticated
 * admin.
 *
 * Steps:
 *
 * 1. Join as a system admin to obtain authenticated session (token auto-attached).
 * 2. Create a new event type and capture its id.
 * 3. Attempt to delete the event type using an unauthenticated connection; expect
 *    an error.
 * 4. Delete the same event type using the authenticated connection; expect
 *    success.
 * 5. Attempt to delete it again with authentication; expect an error (already
 *    deleted), which also proves the resource existed prior to the
 *    authenticated deletion.
 */
export async function test_api_event_type_deletion_unauthorized(
  connection: api.IConnection,
) {
  // 1) Join as system admin (token is attached by SDK)
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(adminAuth);

  // 2) Create an event type to target
  const created: ITodoAppEventType =
    await api.functional.todoApp.systemAdmin.eventTypes.create(connection, {
      body: {
        code: `evt-${RandomGenerator.alphaNumeric(12)}`,
        name: RandomGenerator.name(3),
        description: RandomGenerator.paragraph({ sentences: 6 }),
        active: true,
      } satisfies ITodoAppEventType.ICreate,
    });
  typia.assert(created);

  // 3) Attempt unauthorized deletion (no Authorization header)
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated delete must be rejected",
    async () =>
      await api.functional.todoApp.systemAdmin.eventTypes.erase(unauthConn, {
        eventTypeId: created.id,
      }),
  );

  // 4) Perform authenticated deletion - expect success (void)
  await api.functional.todoApp.systemAdmin.eventTypes.erase(connection, {
    eventTypeId: created.id,
  });

  // 5) Re-delete (authenticated) - expect error since it's already deleted
  await TestValidator.error(
    "re-deleting already removed event type should fail",
    async () =>
      await api.functional.todoApp.systemAdmin.eventTypes.erase(connection, {
        eventTypeId: created.id,
      }),
  );
}
