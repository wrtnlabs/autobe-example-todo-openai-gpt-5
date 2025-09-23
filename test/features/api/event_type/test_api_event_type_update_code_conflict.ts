import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEventType";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Validate uniqueness conflict on event type code update.
 *
 * Business context:
 *
 * - Event type `code` must be globally unique (taxonomy key like "todo.created").
 *
 * Steps:
 *
 * 1. Join as systemAdmin (auth token handled by SDK).
 * 2. Create two event types A and B with distinct codes.
 * 3. Attempt to update A's code to B's code -> expect error.
 * 4. Perform a valid, non-code update on A to confirm record remains consistent.
 *
 * Validations:
 *
 * - Error occurs when trying to set duplicate code.
 * - A's code remains unchanged after failed update.
 * - Follow-up valid update reflects changes and retains original id.
 */
export async function test_api_event_type_update_code_conflict(
  connection: api.IConnection,
) {
  // 1) Authenticate as systemAdmin
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, { body: joinBody });
  typia.assert(admin);

  // 2) Create two distinct event types A and B
  const codeA = `todo.${RandomGenerator.alphabets(6)}`;
  const createA = {
    code: codeA,
    name: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.paragraph({ sentences: 6 }),
    active: true,
  } satisfies ITodoAppEventType.ICreate;
  const a: ITodoAppEventType =
    await api.functional.todoApp.systemAdmin.eventTypes.create(connection, {
      body: createA,
    });
  typia.assert(a);

  let codeB = `todo.${RandomGenerator.alphabets(6)}`;
  if (codeB === codeA) codeB = `${codeB}.${RandomGenerator.alphabets(3)}`;
  const createB = {
    code: codeB,
    name: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.paragraph({ sentences: 5 }),
    active: true,
  } satisfies ITodoAppEventType.ICreate;
  const b: ITodoAppEventType =
    await api.functional.todoApp.systemAdmin.eventTypes.create(connection, {
      body: createB,
    });
  typia.assert(b);

  // 3) Attempt to update A's code to B's code -> should fail (duplicate code)
  await TestValidator.error(
    "duplicate code update must be rejected",
    async () => {
      await api.functional.todoApp.systemAdmin.eventTypes.update(connection, {
        eventTypeId: a.id,
        body: {
          code: b.code,
        } satisfies ITodoAppEventType.IUpdate,
      });
    },
  );

  // 4) Follow-up valid update on A to prove consistency
  const newDescription = RandomGenerator.paragraph({ sentences: 4 });
  const aUpdated: ITodoAppEventType =
    await api.functional.todoApp.systemAdmin.eventTypes.update(connection, {
      eventTypeId: a.id,
      body: {
        description: newDescription,
      } satisfies ITodoAppEventType.IUpdate,
    });
  typia.assert(aUpdated);

  // Confirm the id is the same
  TestValidator.equals("updated entity keeps the same id", aUpdated.id, a.id);
  // Confirm the code was not changed by the failed update
  TestValidator.equals(
    "code remains original after failed duplicate update",
    aUpdated.code,
    a.code,
  );
  // Confirm the valid update applied
  TestValidator.equals(
    "description updated successfully",
    aUpdated.description,
    newDescription,
  );
}
