import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppTodo";
import type { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Verify owner isolation and exclusion of soft-deleted records in Todo listing.
 *
 * Scenario:
 *
 * - Create User B first and create one Todo (bTodo).
 * - Switch to User A by joining A; create two Todos (aTodo1, aTodo2).
 * - Soft-delete aTodo1.
 * - List as User A and validate:
 *
 *   - Deleted aTodo1 is excluded
 *   - ATodo2 appears
 *   - User B’s bTodo is excluded (owner isolation)
 * - Negative check: User A cannot delete B’s Todo (expect error).
 */
export async function test_api_todo_list_deleted_excluded_and_owner_isolation(
  connection: api.IConnection,
) {
  // 1) Join User B and create one Todo (to verify owner isolation later)
  const passwordB: string = RandomGenerator.alphaNumeric(12);
  const emailB: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();

  const authB: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email: emailB,
        password: passwordB,
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(authB);

  const bTodo: ITodoAppTodo =
    await api.functional.todoApp.todoUser.todos.create(connection, {
      body: {
        title: `B - ${RandomGenerator.paragraph({ sentences: 3 })}`,
      } satisfies ITodoAppTodo.ICreate,
    });
  typia.assert(bTodo);

  // 2) Switch to User A (by joining) and create two Todos
  const passwordA: string = RandomGenerator.alphaNumeric(12);
  const emailA: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();

  const authA: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email: emailA,
        password: passwordA,
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(authA);

  const aTodo1: ITodoAppTodo =
    await api.functional.todoApp.todoUser.todos.create(connection, {
      body: {
        title: `A1 - ${RandomGenerator.paragraph({ sentences: 3 })}`,
      } satisfies ITodoAppTodo.ICreate,
    });
  typia.assert(aTodo1);

  const aTodo2: ITodoAppTodo =
    await api.functional.todoApp.todoUser.todos.create(connection, {
      body: {
        title: `A2 - ${RandomGenerator.paragraph({ sentences: 3 })}`,
      } satisfies ITodoAppTodo.ICreate,
    });
  typia.assert(aTodo2);

  // 3) Soft-delete aTodo1
  await api.functional.todoApp.todoUser.todos.erase(connection, {
    todoId: aTodo1.id,
  });

  // 4) List as User A and validate owner isolation & deleted exclusion
  const pageA: IPageITodoAppTodo.ISummary =
    await api.functional.todoApp.todoUser.todos.index(connection, {
      body: {
        status: "all",
      } satisfies ITodoAppTodo.IRequest,
    });
  typia.assert(pageA);

  TestValidator.predicate(
    "User A list excludes soft-deleted aTodo1",
    pageA.data.every((s) => s.id !== aTodo1.id),
  );
  TestValidator.predicate(
    "User A list includes non-deleted aTodo2",
    pageA.data.some((s) => s.id === aTodo2.id),
  );
  TestValidator.predicate(
    "User A list excludes User B's bTodo (owner isolation)",
    pageA.data.every((s) => s.id !== bTodo.id),
  );

  // 5) Negative check: User A must NOT be able to delete User B's Todo
  await TestValidator.error("User A cannot delete User B's todo", async () => {
    await api.functional.todoApp.todoUser.todos.erase(connection, {
      todoId: bTodo.id,
    });
  });
}
