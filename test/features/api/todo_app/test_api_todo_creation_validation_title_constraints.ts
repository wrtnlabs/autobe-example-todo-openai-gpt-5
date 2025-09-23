import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Validate Todo creation input constraints for title, due_at, and description.
 *
 * Business goals:
 *
 * - Ensure the server rejects invalid titles (empty, whitespace-only, >120
 *   chars).
 * - Ensure the server rejects invalid due_at format when provided.
 * - Ensure the server enforces description length limit (2000 chars).
 * - Verify a happy-path creation succeeds and core fields are set.
 *
 * Workflow:
 *
 * 1. Join as a todoUser to obtain authorized context.
 * 2. Attempt invalid creations and expect errors (without asserting HTTP codes).
 * 3. Perform a valid creation and assert persisted values and defaults.
 */
export async function test_api_todo_creation_validation_title_constraints(
  connection: api.IConnection,
) {
  // 1) Authenticate as todoUser
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authorized);

  // 2) Negative cases: title constraints
  const emptyTitleBody = {
    title: "",
    description: null,
    due_at: null,
  } satisfies ITodoAppTodo.ICreate;
  await TestValidator.error(
    "rejects empty title",
    async () =>
      await api.functional.todoApp.todoUser.todos.create(connection, {
        body: emptyTitleBody,
      }),
  );

  const whitespaceTitle = ArrayUtil.repeat(3, () => " ").join("");
  const whitespaceTitleBody = {
    title: whitespaceTitle,
    description: null,
    due_at: null,
  } satisfies ITodoAppTodo.ICreate;
  await TestValidator.error(
    "rejects whitespace-only title",
    async () =>
      await api.functional.todoApp.todoUser.todos.create(connection, {
        body: whitespaceTitleBody,
      }),
  );

  const longTitle = ArrayUtil.repeat(121, () => "x").join("");
  const longTitleBody = {
    title: longTitle,
    description: null,
    due_at: null,
  } satisfies ITodoAppTodo.ICreate;
  await TestValidator.error(
    "rejects title exceeding 120 chars",
    async () =>
      await api.functional.todoApp.todoUser.todos.create(connection, {
        body: longTitleBody,
      }),
  );

  // 2b) Negative case: invalid due_at format
  const invalidDueAtBody = {
    title: RandomGenerator.paragraph({ sentences: 3 }),
    description: null,
    due_at: "not-a-date-time",
  } satisfies ITodoAppTodo.ICreate;
  await TestValidator.error(
    "rejects invalid due_at format",
    async () =>
      await api.functional.todoApp.todoUser.todos.create(connection, {
        body: invalidDueAtBody,
      }),
  );

  // 2c) Negative case: description too long (> 2000)
  const overlongDescription = ArrayUtil.repeat(2001, () => "a").join("");
  const overlongDescriptionBody = {
    title: RandomGenerator.paragraph({ sentences: 4 }),
    description: overlongDescription,
    due_at: null,
  } satisfies ITodoAppTodo.ICreate;
  await TestValidator.error(
    "rejects description exceeding 2000 chars",
    async () =>
      await api.functional.todoApp.todoUser.todos.create(connection, {
        body: overlongDescriptionBody,
      }),
  );

  // 3) Positive path: valid creation
  const validBody = {
    title: RandomGenerator.paragraph({ sentences: 4 }),
    description: RandomGenerator.paragraph({ sentences: 20 }),
    due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  } satisfies ITodoAppTodo.ICreate;
  const created = await api.functional.todoApp.todoUser.todos.create(
    connection,
    { body: validBody },
  );
  typia.assert(created);

  // Business assertions
  TestValidator.equals(
    "title persisted equals input",
    created.title,
    validBody.title,
  );
  TestValidator.equals(
    "description persisted equals input",
    created.description ?? null,
    validBody.description ?? null,
  );
  TestValidator.equals(
    "due_at persisted equals input",
    created.due_at ?? null,
    validBody.due_at ?? null,
  );
  TestValidator.equals("status is open on creation", created.status, "open");
  TestValidator.predicate(
    "completed_at is nullish on creation",
    created.completed_at === null || created.completed_at === undefined,
  );
}
