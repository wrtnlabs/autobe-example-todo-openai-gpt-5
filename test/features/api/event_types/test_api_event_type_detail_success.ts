import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEventType";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

export async function test_api_event_type_detail_success(
  connection: api.IConnection,
) {
  /**
   * Validate that a system administrator can retrieve an event type by ID.
   *
   * Steps:
   *
   * 1. Join as systemAdmin to acquire authenticated context.
   * 2. Create a fresh event type (unique code, active=true).
   * 3. Retrieve the event type by ID and verify fields.
   */

  // 1) Authenticate as systemAdmin (use satisfies for request body typing)
  const adminJoinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppSystemAdminJoin.ICreate;

  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: adminJoinBody,
    });
  typia.assert(adminAuth);

  // 2) Create a fresh event type (ensure unique code)
  const createBody = {
    code: `todo.${RandomGenerator.alphaNumeric(10)}`,
    name: RandomGenerator.paragraph({ sentences: 2 }),
    description: RandomGenerator.paragraph({ sentences: 6 }),
    active: true,
  } satisfies ITodoAppEventType.ICreate;

  const created: ITodoAppEventType =
    await api.functional.todoApp.systemAdmin.eventTypes.create(connection, {
      body: createBody,
    });
  typia.assert(created);

  // 3) Retrieve by ID and verify
  const read: ITodoAppEventType =
    await api.functional.todoApp.systemAdmin.eventTypes.at(connection, {
      eventTypeId: created.id,
    });
  typia.assert(read);

  // Field-level validations
  TestValidator.equals("detail id equals created id", read.id, created.id);
  TestValidator.equals(
    "detail code equals created code",
    read.code,
    createBody.code,
  );
  TestValidator.equals(
    "detail name equals created name",
    read.name,
    createBody.name,
  );
  TestValidator.equals(
    "detail active equals created active",
    read.active,
    createBody.active,
  );

  // Optional holistic check (structures should match exactly if no background mutations)
  TestValidator.equals("detail equals created entity", read, created);
}
