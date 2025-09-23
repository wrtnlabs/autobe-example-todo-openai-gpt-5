import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEventType";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Validate that updating a non-existent event type fails without side effects.
 *
 * Business context:
 *
 * - Event types (todo_app_event_types) define taxonomy for analytics/events.
 * - Only system administrators may mutate them.
 *
 * Steps:
 *
 * 1. Join as systemAdmin to acquire an authenticated session/token.
 * 2. Attempt to update an event type by a random UUID not expected to exist.
 * 3. Ensure the operation fails (do not assert specific status codes).
 */
export async function test_api_event_type_update_not_found(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // 8~64 chars policy satisfied
    // optional context fields
    ip: undefined,
    user_agent: undefined,
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: joinBody,
  });
  typia.assert(admin); // ITodoAppSystemAdmin.IAuthorized

  // 2) Build a valid update payload and use a random non-existent UUID
  const updateBody = {
    // Choose a realistic code and metadata
    code: `evt.${RandomGenerator.alphabets(4)}.${RandomGenerator.alphabets(5)}`,
    name: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.paragraph({ sentences: 6 }),
    active: true,
  } satisfies ITodoAppEventType.IUpdate;

  const unknownId = typia.random<string & tags.Format<"uuid">>();

  // 3) Expect error when updating non-existent event type id
  await TestValidator.error(
    "updating a non-existent event type must fail",
    async () => {
      await api.functional.todoApp.systemAdmin.eventTypes.update(connection, {
        eventTypeId: unknownId,
        body: updateBody,
      });
    },
  );
}
