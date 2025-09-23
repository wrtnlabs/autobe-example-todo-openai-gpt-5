import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEventType";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Ensure event type update is denied without authentication and succeeds with
 * valid admin credentials.
 *
 * Steps:
 *
 * 1. Register a system administrator (join) to obtain an authenticated session.
 * 2. Create an event type (seed target entity) and keep its id and name.
 * 3. Create an unauthenticated connection (empty headers) and attempt to update →
 *    must error.
 * 4. As a control, perform an authorized update and confirm the name changed while
 *    id remains the same.
 *
 * Notes:
 *
 * - We do not assert specific HTTP status codes; we only assert that an error
 *   occurs for the unauthorized attempt.
 * - No GET endpoint is provided to re-fetch for post-state verification; control
 *   update verifies endpoint functionality when authorized.
 */
export async function test_api_event_type_update_unauthorized(
  connection: api.IConnection,
) {
  // 1) Admin registration (join) → SDK sets Authorization token on connection
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: typia.random<ITodoAppSystemAdminJoin.ICreate>(),
    });
  typia.assert(admin);

  // 2) Seed an event type to target
  const created: ITodoAppEventType =
    await api.functional.todoApp.systemAdmin.eventTypes.create(connection, {
      body: typia.random<ITodoAppEventType.ICreate>(),
    });
  typia.assert(created);

  // 3) Attempt update without credentials using a clean connection headers object
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthorized update attempt should be rejected",
    async () => {
      await api.functional.todoApp.systemAdmin.eventTypes.update(unauthConn, {
        eventTypeId: created.id,
        body: {
          name: RandomGenerator.paragraph({ sentences: 3 }),
          active: !created.active,
        } satisfies ITodoAppEventType.IUpdate,
      });
    },
  );

  // 4) Control: authorized update should succeed and change the name
  const newName: string = RandomGenerator.paragraph({ sentences: 2 });
  const updated: ITodoAppEventType =
    await api.functional.todoApp.systemAdmin.eventTypes.update(connection, {
      eventTypeId: created.id,
      body: {
        name: newName,
      } satisfies ITodoAppEventType.IUpdate,
    });
  typia.assert(updated);

  // Validate id unchanged and name updated
  TestValidator.equals(
    "id remains the same after authorized update",
    updated.id,
    created.id,
  );
  TestValidator.notEquals(
    "name changed after authorized update",
    updated.name,
    created.name,
  );
}
