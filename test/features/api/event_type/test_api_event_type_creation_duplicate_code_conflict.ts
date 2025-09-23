import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEventType";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

export async function test_api_event_type_creation_duplicate_code_conflict(
  connection: api.IConnection,
) {
  /**
   * Validate that creating an event type with a duplicate code is rejected.
   *
   * Steps:
   *
   * 1. Register a system admin (SDK sets Authorization automatically).
   * 2. Create an event type with a unique code based on prefix "todo.completed".
   * 3. Attempt to create another event type using the same code (should fail).
   * 4. Sanity: create a different code to ensure system remains functional.
   */

  // 1) Authenticate as systemAdmin
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppSystemAdminJoin.ICreate;
  const admin: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, { body: joinBody });
  typia.assert(admin);

  // 2) Create an initial event type
  const uniqueSuffix = RandomGenerator.alphaNumeric(12);
  const code = `todo.completed.${uniqueSuffix}`;
  const createBody1 = {
    code,
    name: `Todo Completed ${RandomGenerator.name(1)}`,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    active: true,
  } satisfies ITodoAppEventType.ICreate;
  const created1: ITodoAppEventType =
    await api.functional.todoApp.systemAdmin.eventTypes.create(connection, {
      body: createBody1,
    });
  typia.assert(created1);

  // Basic invariants on the created record
  TestValidator.equals("created code should match input", created1.code, code);
  TestValidator.equals(
    "created active flag should match input",
    created1.active,
    true,
  );

  // 3) Attempt duplicate creation with the same code (different other fields)
  const createBodyDuplicate = {
    code, // duplicate on purpose
    name: `Duplicate ${RandomGenerator.name(1)}`,
    description: RandomGenerator.paragraph({ sentences: 4 }),
    active: false,
  } satisfies ITodoAppEventType.ICreate;
  await TestValidator.error(
    "duplicate event type code must be rejected",
    async () => {
      await api.functional.todoApp.systemAdmin.eventTypes.create(connection, {
        body: createBodyDuplicate,
      });
    },
  );

  // 4) Sanity: another code should still succeed
  const code2 = `todo.completed.${RandomGenerator.alphaNumeric(12)}`;
  const createBody2 = {
    code: code2,
    name: `Todo Completed ${RandomGenerator.name(1)} (alt)`,
    description: RandomGenerator.paragraph({ sentences: 5 }),
    active: true,
  } satisfies ITodoAppEventType.ICreate;
  const created2: ITodoAppEventType =
    await api.functional.todoApp.systemAdmin.eventTypes.create(connection, {
      body: createBody2,
    });
  typia.assert(created2);

  TestValidator.equals(
    "second unique creation code should match input",
    created2.code,
    code2,
  );
}
