import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_todo_update_fields_and_timestamps(
  connection: api.IConnection,
) {
  /**
   * Validate updating mutable fields (title, description, due_at) and timestamp
   * semantics.
   *
   * Steps:
   *
   * 1. Join as todoUser (auth) → token managed by SDK
   * 2. Create a Todo and capture baseline state
   * 3. Update title, description, and due_at using PUT
   * 4. Validate: fields updated, created_at unchanged, updated_at increased,
   *    status remains 'open', completed_at remains nullish
   */

  // 1) Authenticate as a new todoUser
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);

  // 2) Create a Todo (capture baseline)
  const initialDueAt = new Date(
    RandomGenerator.date(new Date(), 1000 * 60 * 60 * 24 * 30),
  ).toISOString();
  const createBody = {
    title: RandomGenerator.paragraph({ sentences: 3, wordMin: 3, wordMax: 8 }),
    description: RandomGenerator.paragraph({ sentences: 8 }),
    due_at: initialDueAt,
  } satisfies ITodoAppTodo.ICreate;
  const created = await api.functional.todoApp.todoUser.todos.create(
    connection,
    {
      body: createBody,
    },
  );
  typia.assert(created);

  // Baseline values
  const baseId = created.id;
  const baseCreatedAt = created.created_at;
  const baseUpdatedAt = created.updated_at;

  // Initial business state checks
  TestValidator.equals(
    "initial status set to 'open' on creation",
    created.status,
    "open",
  );
  TestValidator.predicate(
    "completed_at is nullish on creation",
    created.completed_at === null || created.completed_at === undefined,
  );

  // 3) Update mutable fields (title, description, due_at)
  const nextDueAt = new Date(
    RandomGenerator.date(new Date(), 1000 * 60 * 60 * 24 * 60),
  ).toISOString();
  const updateBody = {
    title: RandomGenerator.paragraph({ sentences: 4, wordMin: 3, wordMax: 8 }),
    description: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 6,
      sentenceMax: 12,
      wordMin: 3,
      wordMax: 10,
    }),
    due_at: nextDueAt,
  } satisfies ITodoAppTodo.IUpdate;
  const updated = await api.functional.todoApp.todoUser.todos.update(
    connection,
    {
      todoId: baseId,
      body: updateBody,
    },
  );
  typia.assert(updated);

  // 4) Validation: identity, fields, and timestamps
  TestValidator.equals("todo id stable after update", updated.id, baseId);
  TestValidator.equals("title updated", updated.title, updateBody.title);
  TestValidator.equals(
    "description updated",
    updated.description,
    updateBody.description,
  );
  TestValidator.equals("due_at updated", updated.due_at, updateBody.due_at);

  TestValidator.equals(
    "created_at unchanged after update",
    updated.created_at,
    baseCreatedAt,
  );
  TestValidator.predicate(
    "updated_at strictly increased after update",
    new Date(updated.updated_at).getTime() > new Date(baseUpdatedAt).getTime(),
  );

  TestValidator.equals(
    "status remains 'open' after fields update",
    updated.status,
    "open",
  );
  TestValidator.predicate(
    "completed_at remains nullish after fields update",
    updated.completed_at === null || updated.completed_at === undefined,
  );
}
