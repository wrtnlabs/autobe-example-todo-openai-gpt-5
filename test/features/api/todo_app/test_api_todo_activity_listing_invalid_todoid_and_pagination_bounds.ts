import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { EActivityType } from "@ORGANIZATION/PROJECT-api/lib/structures/EActivityType";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppTodoActivity } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppTodoActivity";
import type { ITodoAppTodoActivity } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoActivity";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Validate error handling for Todo activity listing with malformed identifiers
 * and pagination bounds.
 *
 * Business context:
 *
 * - The activities endpoint lists audit history for a Todo item. Access is
 *   protected to the owner (todoUser).
 * - Validation rules include UUID format for {todoId} and numeric constraints for
 *   pagination: page >= 1, 1 <= limit <= 100.
 *
 * What this test validates:
 *
 * 1. Authentication via /auth/todoUser/join works and returns authorized context.
 * 2. Listing with non-UUID todoId is rejected.
 * 3. Listing with limit > 100 is rejected.
 * 4. Listing with page = 0 is rejected.
 * 5. Listing with page < 0 is rejected.
 *
 * Notes:
 *
 * - We assert only that an error occurs (do not check exact HTTP status or
 *   message).
 * - We maintain strict typing using `satisfies` for request DTOs and typia.assert
 *   on responses.
 */
export async function test_api_todo_activity_listing_invalid_todoid_and_pagination_bounds(
  connection: api.IConnection,
) {
  // 1) Authenticate as a todoUser
  const authorized = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(authorized);

  // 2) Non-UUID todoId should be rejected
  await TestValidator.error(
    "rejects non-UUID todoId on activity listing",
    async () => {
      await api.functional.todoApp.todoUser.todos.activities.index(connection, {
        todoId: "not-a-uuid",
        body: {} satisfies ITodoAppTodoActivity.IRequest,
      });
    },
  );

  // Use fresh valid random UUIDs for each subsequent pagination validation
  const uuidForLimit = typia.random<string & tags.Format<"uuid">>();
  const uuidForPageZero = typia.random<string & tags.Format<"uuid">>();
  const uuidForPageNegative = typia.random<string & tags.Format<"uuid">>();

  // 3) limit > 100 should be rejected
  await TestValidator.error("rejects limit over maximum 100", async () => {
    await api.functional.todoApp.todoUser.todos.activities.index(connection, {
      todoId: uuidForLimit,
      body: { limit: 101 } satisfies ITodoAppTodoActivity.IRequest,
    });
  });

  // 4) page = 0 should be rejected
  await TestValidator.error("rejects page number zero", async () => {
    await api.functional.todoApp.todoUser.todos.activities.index(connection, {
      todoId: uuidForPageZero,
      body: { page: 0 } satisfies ITodoAppTodoActivity.IRequest,
    });
  });

  // 5) page < 0 should be rejected
  await TestValidator.error("rejects negative page number", async () => {
    await api.functional.todoApp.todoUser.todos.activities.index(connection, {
      todoId: uuidForPageNegative,
      body: { page: -1 } satisfies ITodoAppTodoActivity.IRequest,
    });
  });
}
