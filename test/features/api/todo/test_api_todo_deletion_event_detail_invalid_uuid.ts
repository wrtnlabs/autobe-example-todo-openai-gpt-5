import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppTodoDeletionEvent } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoDeletionEvent";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Validate error on fetching deletion event detail with non-existent resources
 * using valid UUIDs.
 *
 * Because the SDK requires UUID-typed path parameters, we cannot send malformed
 * UUIDs directly. Instead, we authenticate as a todoUser and call the detail
 * endpoint with random valid UUIDs that should not match any accessible
 * resource, expecting the provider to reject the request (e.g., not-found or
 * authorization failure). We validate only that an error occurs.
 *
 * Steps:
 *
 * 1. Join as a new todoUser using valid email/password and assert authorization
 *    response.
 * 2. Call GET /todoApp/todoUser/todos/{todoId}/deletionEvents/{deletionEventId}
 *    with random valid UUIDs.
 * 3. Expect the call to throw and validate with TestValidator.error.
 */
export async function test_api_todo_deletion_event_detail_invalid_uuid(
  connection: api.IConnection,
) {
  // 1) Authenticate (join) as todoUser
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // satisfies 8..64 policy
  } satisfies ITodoAppTodoUser.ICreate;
  const auth = await api.functional.auth.todoUser.join(connection, {
    body: joinBody,
  });
  typia.assert(auth);

  // 2) Prepare valid-but-random UUIDs for path params
  const todoId = typia.random<string & tags.Format<"uuid">>();
  const deletionEventId = typia.random<string & tags.Format<"uuid">>();

  // 3) Expect error when accessing non-existent/non-owned resources
  await TestValidator.error(
    "deletion event detail should error for non-existent IDs despite valid UUID format",
    async () => {
      await api.functional.todoApp.todoUser.todos.deletionEvents.at(
        connection,
        {
          todoId,
          deletionEventId,
        },
      );
    },
  );
}
