import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEventType";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Validate event type creation constraints and duplicate code rejection.
 *
 * Business flow:
 *
 * 1. System admin joins (auth); SDK manages token automatically.
 * 2. Create a valid event type with a unique code.
 * 3. Attempt to create another event type with the same code → expect error
 *    (business rule: unique code).
 * 4. Create another event type with a different code to ensure system still
 *    accepts valid inputs after failure.
 *
 * Notes:
 *
 * - We do not test missing required fields or wrong data types to avoid
 *   type-error testing.
 * - Error validation uses TestValidator.error without checking specific HTTP
 *   status codes.
 */
export async function test_api_event_type_creation_invalid_payload(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(adminAuth);

  // 2) Create a valid event type
  const code: string = `evt.${RandomGenerator.alphabets(8)}`;
  const createBody1 = {
    code,
    name: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.paragraph({ sentences: 8 }),
    active: true,
  } satisfies ITodoAppEventType.ICreate;

  const created1: ITodoAppEventType =
    await api.functional.todoApp.systemAdmin.eventTypes.create(connection, {
      body: createBody1,
    });
  typia.assert(created1);
  TestValidator.equals("created code matches request", created1.code, code);
  TestValidator.equals("created active matches request", created1.active, true);

  // 3) Duplicate code attempt should fail
  const duplicateBody = {
    code, // same code to violate uniqueness
    name: RandomGenerator.paragraph({ sentences: 2 }),
    description: RandomGenerator.paragraph({ sentences: 6 }),
    active: true,
  } satisfies ITodoAppEventType.ICreate;

  await TestValidator.error("duplicate code should be rejected", async () => {
    await api.functional.todoApp.systemAdmin.eventTypes.create(connection, {
      body: duplicateBody,
    });
  });

  // 4) Create another valid event type with a different code to ensure system works after failed attempt
  const code2: string = `evt.${RandomGenerator.alphabets(8)}`;
  const createBody2 = {
    code: code2,
    name: RandomGenerator.paragraph({ sentences: 3 }),
    description: RandomGenerator.paragraph({ sentences: 5 }),
    active: false,
  } satisfies ITodoAppEventType.ICreate;

  const created2: ITodoAppEventType =
    await api.functional.todoApp.systemAdmin.eventTypes.create(connection, {
      body: createBody2,
    });
  typia.assert(created2);
  TestValidator.notEquals(
    "newly created event type has different id",
    created2.id,
    created1.id,
  );
}
