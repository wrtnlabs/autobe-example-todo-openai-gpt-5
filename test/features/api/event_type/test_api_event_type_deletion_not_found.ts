import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Deleting a non-existent event type must fail (not-found behavior).
 *
 * Business context:
 *
 * - Event types are managed by system administrators. Attempting to delete an
 *   unknown event type ID should be rejected by the service.
 *
 * Test workflow:
 *
 * 1. Register (join) as a system administrator to acquire authorization.
 * 2. Attempt to DELETE an event type using a random UUID that is unlikely to
 *    exist.
 * 3. Validate that the operation fails by asserting an error is thrown.
 *
 * Notes:
 *
 * - We do not assert specific HTTP statuses; we only verify that an error occurs.
 * - Side-effect validation is omitted because no list/create endpoints for event
 *   types are provided in the current SDK scope.
 */
export async function test_api_event_type_deletion_not_found(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin (join)
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12);

  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email,
      password,
      user_agent: RandomGenerator.paragraph({ sentences: 3 }),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert<ITodoAppSystemAdmin.IAuthorized>(admin);

  // 2) Attempt deletion with a random unknown UUID
  const unknownEventTypeId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();

  // 3) Validate that deletion fails (not-found behavior)
  await TestValidator.error(
    "deleting non-existent event type should raise an error",
    async () => {
      await api.functional.todoApp.systemAdmin.eventTypes.erase(connection, {
        eventTypeId: unknownEventTypeId,
      });
    },
  );
}
