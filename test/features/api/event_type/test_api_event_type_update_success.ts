import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEventType";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * System admin updates an existing event type successfully.
 *
 * Flow:
 *
 * 1. Join as system admin to obtain authenticated context.
 * 2. Create a seed event type (code, name, description?, active) to obtain its id.
 * 3. Update the event type using PUT with changed fields: name, toggled active,
 *    and clear description to null (code left unchanged).
 * 4. Validate: id stable, code unchanged, fields updated, created_at unchanged,
 *    updated_at increased.
 */
export async function test_api_event_type_update_success(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin (join)
  const admin = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
      ip: "127.0.0.1",
      user_agent: `e2e/${RandomGenerator.alphaNumeric(8)}`,
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(admin);

  // 2) Create a seed event type
  const initialName = RandomGenerator.paragraph({ sentences: 3 });
  const initialDescription = RandomGenerator.paragraph({ sentences: 6 });
  const initialActive = true;
  const initialCode = `todo.${RandomGenerator.alphabets(8)}`;

  const created = await api.functional.todoApp.systemAdmin.eventTypes.create(
    connection,
    {
      body: {
        code: initialCode,
        name: initialName,
        description: initialDescription,
        active: initialActive,
      } satisfies ITodoAppEventType.ICreate,
    },
  );
  typia.assert(created);

  // 3) Update fields: name change, toggle active, clear description
  const updatedName = RandomGenerator.paragraph({ sentences: 4 });
  const updateBody = {
    name: updatedName,
    active: !created.active,
    description: null,
  } satisfies ITodoAppEventType.IUpdate;

  const updated = await api.functional.todoApp.systemAdmin.eventTypes.update(
    connection,
    {
      eventTypeId: created.id,
      body: updateBody,
    },
  );
  typia.assert(updated);

  // 4) Business validations
  TestValidator.equals(
    "id remains stable after update",
    updated.id,
    created.id,
  );
  TestValidator.equals(
    "code unchanged when not provided in update",
    updated.code,
    created.code,
  );
  TestValidator.equals("name updated to new value", updated.name, updatedName);
  TestValidator.equals("active flag toggled", updated.active, !created.active);
  TestValidator.equals(
    "description cleared to null",
    updated.description,
    null,
  );
  TestValidator.equals(
    "created_at remains unchanged",
    updated.created_at,
    created.created_at,
  );

  const beforeUpdatedAt = new Date(created.updated_at).getTime();
  const afterUpdatedAt = new Date(updated.updated_at).getTime();
  TestValidator.predicate(
    "updated_at is later than before",
    afterUpdatedAt > beforeUpdatedAt,
  );
}
