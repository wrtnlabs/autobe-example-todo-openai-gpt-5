import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoActivity } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoActivity";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_todo_activity_detail_invalid_uuid(
  connection: api.IConnection,
) {
  /**
   * Validate activity detail retrieval with well-formed but non-existent IDs
   * and authorization rules.
   *
   * Original intent: test malformed UUIDs in path parameters. However, the SDK
   * enforces UUID formats at compile-time, and E2E policies forbid deliberate
   * type errors. Therefore, this test verifies runtime error behavior using
   * syntactically valid but non-existent UUIDs and also checks unauthenticated
   * access rejection.
   *
   * Steps:
   *
   * 1. Register a todoUser (join) to acquire authentication context.
   * 2. Call GET /todoApp/todoUser/todos/{todoId}/activities/{activityId} with
   *    random UUIDs that should not exist and expect an error.
   * 3. Create an unauthenticated connection and repeat the call, expecting an
   *    error.
   */
  // 1) Authenticate as todoUser (join)
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string & tags.MinLength<8> & tags.MaxLength<64> =
    typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>();

  const auth = await api.functional.auth.todoUser.join(connection, {
    body: {
      email,
      password,
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(auth);

  // Prepare well-formed random UUIDs that should not correspond to real records
  const randomTodoId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();
  const randomActivityId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();

  // 2) Expect error when accessing non-existent activity under non-existent todo (authenticated)
  await TestValidator.error(
    "non-existent todo/activity should be rejected",
    async () => {
      await api.functional.todoApp.todoUser.todos.activities.at(connection, {
        todoId: randomTodoId,
        activityId: randomActivityId,
      });
    },
  );

  // 3) Expect error when unauthenticated
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error("unauthenticated access must fail", async () => {
    await api.functional.todoApp.todoUser.todos.activities.at(unauthConn, {
      todoId: randomTodoId,
      activityId: randomActivityId,
    });
  });
}
