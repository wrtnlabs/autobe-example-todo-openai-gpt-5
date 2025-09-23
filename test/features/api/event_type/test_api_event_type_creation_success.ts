import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEventType";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

/**
 * Happy path: System admin creates a new event type successfully and the
 * returned entity reflects requested fields. Also validates the uniqueness
 * constraint on `code` by attempting a duplicate creation that must fail.
 *
 * Steps
 *
 * 1. Join as system admin (authentication).
 * 2. Create an event type with a unique code, name, optional description, and
 *    active=true.
 * 3. Validate returned fields and timestamps.
 * 4. Attempt to create another event type with the same code to verify uniqueness
 *    error (skipped when in simulate mode).
 */
export async function test_api_event_type_creation_success(
  connection: api.IConnection,
) {
  // 1) Authenticate as system admin (join)
  const adminEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const adminPassword: string = RandomGenerator.alphaNumeric(12);

  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: adminEmail,
        password: adminPassword,
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(adminAuth);

  // 2) Create a new event type
  const createBody = {
    code: `todo.${RandomGenerator.alphabets(10)}`,
    name: RandomGenerator.paragraph({ sentences: 2, wordMin: 3, wordMax: 8 }),
    description: RandomGenerator.paragraph({
      sentences: 8,
      wordMin: 3,
      wordMax: 10,
    }),
    active: true,
  } satisfies ITodoAppEventType.ICreate;

  const created: ITodoAppEventType =
    await api.functional.todoApp.systemAdmin.eventTypes.create(connection, {
      body: createBody,
    });
  typia.assert(created);

  // 3) Business validations (not type validations)
  TestValidator.equals(
    "created event type code matches input",
    created.code,
    createBody.code,
  );
  TestValidator.equals(
    "created event type name matches input",
    created.name,
    createBody.name,
  );
  TestValidator.equals(
    "created event type description matches input",
    created.description ?? null,
    createBody.description ?? null,
  );
  TestValidator.equals(
    "created event type active matches input",
    created.active,
    createBody.active,
  );

  // Verify timestamp ordering: updated_at >= created_at
  const createdAtMs: number = new Date(created.created_at).getTime();
  const updatedAtMs: number = new Date(created.updated_at).getTime();
  TestValidator.predicate(
    "updated_at is not earlier than created_at",
    updatedAtMs >= createdAtMs,
  );

  // 4) Uniqueness: duplicate creation with same code must fail
  // Skip in simulate mode because simulator returns random successes.
  if (connection.simulate !== true) {
    const duplicateBody = {
      code: createBody.code, // same code triggers unique constraint
      name: RandomGenerator.paragraph({ sentences: 2, wordMin: 3, wordMax: 8 }),
      description: RandomGenerator.paragraph({
        sentences: 6,
        wordMin: 3,
        wordMax: 10,
      }),
      active: true,
    } satisfies ITodoAppEventType.ICreate;

    await TestValidator.error(
      "creating event type with duplicate code must fail",
      async () => {
        await api.functional.todoApp.systemAdmin.eventTypes.create(connection, {
          body: duplicateBody,
        });
      },
    );
  }
}
