import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { IETodoMvpTodoStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IETodoMvpTodoStatus";
import type { ITodoMvpTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpTodo";
import type { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";

/**
 * Validate Todo creation defaults and server-side title trimming for an
 * authenticated user.
 *
 * Business goals:
 *
 * - Ensure a newly registered user (via join) can create a Todo.
 * - Verify server-side defaults and transformations on creation:
 *
 *   - Title is trimmed.
 *   - Status defaults to "open".
 *   - Completed_at is not set (null/undefined).
 *   - Created_at and updated_at are present and initially equal.
 *
 * Test steps:
 *
 * 1. Register a new user using POST /auth/user/join to obtain an authenticated
 *    session (SDK sets the Authorization header automatically).
 * 2. Create a Todo using POST /todoMvp/user/todos with a title that has
 *    leading/trailing spaces.
 * 3. Validate the response with typia.assert and assert business rules with
 *    TestValidator.
 *
 * Notes:
 *
 * - Only creation is tested; no GET-by-id endpoint is provided in the materials,
 *   so re-read is omitted.
 */
export async function test_api_todo_creation_defaults_and_trimming_by_user(
  connection: api.IConnection,
) {
  // 1) Register a new user (join) to obtain an authenticated session
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12); // MinLength<8>

  const auth = await api.functional.auth.user.join(connection, {
    body: {
      email,
      password,
    } satisfies ITodoMvpUser.ICreate,
  });
  typia.assert(auth);

  // 2) Create a Todo with title containing leading/trailing whitespace
  const rawTitle: string = `  ${RandomGenerator.paragraph({ sentences: 2, wordMin: 3, wordMax: 8 })}  `;

  const todo = await api.functional.todoMvp.user.todos.create(connection, {
    body: {
      title: rawTitle,
    } satisfies ITodoMvpTodo.ICreate,
  });
  typia.assert(todo);

  // 3) Business rule validations
  // Title trimming
  TestValidator.equals(
    "title is trimmed on creation",
    todo.title,
    rawTitle.trim(),
  );

  // Status defaults to "open"
  TestValidator.equals("status defaults to open", todo.status, "open");

  // completed_at not set (null or undefined)
  TestValidator.equals(
    "completed_at should be null initially",
    todo.completed_at ?? null,
    null,
  );

  // Timestamp semantics: updated_at equals created_at immediately after creation
  TestValidator.equals(
    "updated_at equals created_at immediately after creation",
    todo.updated_at,
    todo.created_at,
  );
}
