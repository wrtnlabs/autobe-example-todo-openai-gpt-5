import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { IETodoMvpTodoStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IETodoMvpTodoStatus";
import type { ITodoMvpTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpTodo";
import type { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";

export async function test_api_todo_update_title_and_status_transitions(
  connection: api.IConnection,
) {
  /**
   * Validate Todo title update and status transitions with timestamp semantics.
   *
   * Steps:
   *
   * 1. Join as a user (token handled by SDK)
   * 2. Create a Todo (expect status=open, completed_at null/undefined)
   * 3. Update title only (status unchanged; completed_at unchanged; updated_at
   *    increases)
   * 4. Set status to completed (completed_at set; updated_at increases)
   * 5. Reopen to open (completed_at cleared; updated_at increases; created_at
   *    constant)
   */
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = "StrongPass1!"; // >= 8 chars aligns with tags.MinLength<8>

  const auth = await api.functional.auth.user.join(connection, {
    body: {
      email,
      password,
    } satisfies ITodoMvpUser.ICreate,
  });
  typia.assert(auth);

  // 2) Create a Todo
  const title1 = RandomGenerator.paragraph({
    sentences: 3,
    wordMin: 3,
    wordMax: 8,
  });
  const created = await api.functional.todoMvp.user.todos.create(connection, {
    body: {
      title: title1,
    } satisfies ITodoMvpTodo.ICreate,
  });
  typia.assert(created);

  // Helpers
  const toTime = (iso: string): number => new Date(iso).getTime();

  // Expectations right after creation
  TestValidator.equals("initial status is open", created.status, "open");
  await TestValidator.predicate(
    "initial completed_at is null or undefined",
    async () =>
      created.completed_at === null || created.completed_at === undefined,
  );

  const createdAt0 = created.created_at;
  const updatedAt0 = created.updated_at;

  // 3) Title-only update
  const title2 = RandomGenerator.paragraph({
    sentences: 2,
    wordMin: 3,
    wordMax: 7,
  });
  const afterTitle = await api.functional.todoMvp.user.todos.update(
    connection,
    {
      todoId: created.id,
      body: {
        title: title2,
      } satisfies ITodoMvpTodo.IUpdate,
    },
  );
  typia.assert(afterTitle);

  TestValidator.equals(
    "title updated on title-only update",
    afterTitle.title,
    title2,
  );
  TestValidator.equals(
    "status unchanged after title-only update",
    afterTitle.status,
    created.status,
  );
  await TestValidator.predicate(
    "completed_at remains null/undefined after title-only update",
    async () =>
      afterTitle.completed_at === null || afterTitle.completed_at === undefined,
  );
  TestValidator.equals(
    "created_at remains unchanged after title-only update",
    afterTitle.created_at,
    createdAt0,
  );
  await TestValidator.predicate(
    "updated_at increased after title-only update",
    async () => toTime(afterTitle.updated_at) > toTime(updatedAt0),
  );

  const updatedAt1 = afterTitle.updated_at;

  // 4) Mark as completed
  const afterComplete = await api.functional.todoMvp.user.todos.update(
    connection,
    {
      todoId: created.id,
      body: {
        status: "completed",
      } satisfies ITodoMvpTodo.IUpdate,
    },
  );
  typia.assert(afterComplete);

  TestValidator.equals(
    "status set to completed",
    afterComplete.status,
    "completed",
  );
  await TestValidator.predicate(
    "completed_at is set after completing",
    async () =>
      afterComplete.completed_at !== null &&
      afterComplete.completed_at !== undefined,
  );
  await TestValidator.predicate(
    "updated_at increased after completing",
    async () => toTime(afterComplete.updated_at) > toTime(updatedAt1),
  );

  const updatedAt2 = afterComplete.updated_at;

  // 5) Reopen to open
  const afterOpen = await api.functional.todoMvp.user.todos.update(connection, {
    todoId: created.id,
    body: {
      status: "open",
    } satisfies ITodoMvpTodo.IUpdate,
  });
  typia.assert(afterOpen);

  TestValidator.equals("status set back to open", afterOpen.status, "open");
  await TestValidator.predicate(
    "completed_at cleared after reopening",
    async () =>
      afterOpen.completed_at === null || afterOpen.completed_at === undefined,
  );
  TestValidator.equals(
    "created_at remains constant across lifecycle",
    afterOpen.created_at,
    createdAt0,
  );
  await TestValidator.predicate(
    "updated_at increased again after reopening",
    async () => toTime(afterOpen.updated_at) > toTime(updatedAt2),
  );
}
