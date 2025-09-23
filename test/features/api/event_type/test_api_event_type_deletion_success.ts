import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEventType";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Delete an existing event type and verify it is no longer deletable.
 *
 * Business flow:
 *
 * 1. Join as system administrator to obtain authorization.
 * 2. Create an event type (capture its id).
 * 3. Delete the event type by id.
 * 4. Attempt to delete the same id again and expect an error, proving it was
 *    removed.
 *
 * Notes:
 *
 * - We assert response types with typia.assert on non-void responses.
 * - We validate business logic by comparing created fields to input and by
 *   ensuring the second deletion fails using TestValidator.error.
 */
export async function test_api_event_type_deletion_success(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert<ITodoAppSystemAdmin.IAuthorized>(admin);

  // 2) Create an event type to delete
  const createBody = {
    code: `todo.${RandomGenerator.alphabets(8)}`,
    name: RandomGenerator.paragraph({ sentences: 3 }),
    description: null, // exercise nullable field explicitly
    active: true,
  } satisfies ITodoAppEventType.ICreate;

  const created = await api.functional.todoApp.systemAdmin.eventTypes.create(
    connection,
    { body: createBody },
  );
  typia.assert<ITodoAppEventType>(created);

  // Validate created fields echo back inputs
  TestValidator.equals(
    "created code matches input",
    created.code,
    createBody.code,
  );
  TestValidator.equals(
    "created name matches input",
    created.name,
    createBody.name,
  );
  TestValidator.equals(
    "created description matches input (null)",
    created.description,
    createBody.description,
  );
  TestValidator.equals(
    "created active matches input",
    created.active,
    createBody.active,
  );

  // 3) Delete the event type
  await api.functional.todoApp.systemAdmin.eventTypes.erase(connection, {
    eventTypeId: created.id,
  });

  // 4) Confirm deletion by expecting second delete to fail
  await TestValidator.error(
    "deleting the same event type again should fail",
    async () => {
      await api.functional.todoApp.systemAdmin.eventTypes.erase(connection, {
        eventTypeId: created.id,
      });
    },
  );
}
