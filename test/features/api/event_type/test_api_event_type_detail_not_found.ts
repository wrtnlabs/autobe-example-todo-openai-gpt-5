import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEventType";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Not-found behavior for event type detail (with simulation fallback).
 *
 * Purpose:
 *
 * - When a system administrator requests an event type detail by a non-existent
 *   ID, the service should respond with a not-found style failure without
 *   exposing internal details.
 *
 * Flow:
 *
 * 1. Register (authenticate) a system admin via join endpoint.
 * 2. Generate a random UUID presumed to be absent in persistence.
 * 3. Call the event type detail endpoint with that UUID.
 * 4. If running against a real backend, expect the call to fail (not-found style)
 *    and validate only that an error occurs (no status code checks). If running
 *    in simulation mode, the SDK returns a mock entity; in that case just
 *    assert the returned structure type.
 */
export async function test_api_event_type_detail_not_found(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin (SDK auto-manages Authorization header)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: joinBody,
  });
  typia.assert(admin);

  // 2) Prepare a random UUID unlikely to exist as an event type ID
  const unknownEventTypeId = typia.random<string & tags.Format<"uuid">>();

  // 3) Call detail endpoint depending on simulation mode
  if (connection.simulate === true) {
    // In simulation, mock returns a valid entity even for unknown IDs
    const simulated = await api.functional.todoApp.systemAdmin.eventTypes.at(
      connection,
      { eventTypeId: unknownEventTypeId },
    );
    typia.assert(simulated);
  } else {
    // Against real backend, expect not-found style error (no status code check)
    await TestValidator.error(
      "unknown eventTypeId must cause not-found style error",
      async () => {
        await api.functional.todoApp.systemAdmin.eventTypes.at(connection, {
          eventTypeId: unknownEventTypeId,
        });
      },
    );
  }
}
