import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { IEAdminStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAdminStatus";
import type { IEAuditEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAuditEventType";
import type { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import type { IETodoMvpTodoStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IETodoMvpTodoStatus";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoMvpAuditEvent } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoMvpAuditEvent";
import type { ITodoMvpAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdmin";
import type { ITodoMvpAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdminJoin";
import type { ITodoMvpAuditEvent } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAuditEvent";
import type { ITodoMvpTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpTodo";
import type { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";

/**
 * Verify that deleting a user-owned Todo produces an admin-discoverable audit
 * event.
 *
 * Business goal:
 *
 * - Ensure that a user's DELETE action on a Todo generates an audit entry with
 *   event_type "todo_deleted" and that administrators can find it via the audit
 *   listing filters.
 * - Confirm that audit entries do not leak Todo content (title/notes), only
 *   metadata.
 *
 * Steps:
 *
 * 1. Register a user (auth.user.join) and obtain a session.
 * 2. Create a Todo as the user (todoMvp.user.todos.create) and capture its id.
 * 3. Delete the Todo as the user (todoMvp.user.todos.erase).
 * 4. Register an admin (auth.admin.join) to switch context and obtain an admin
 *    session.
 * 5. List audit events (todoMvp.admin.auditEvents.index) with filters for
 *    event_types=["todo_deleted"] and target_todo_id=the deleted todo id.
 *
 * Validations:
 *
 * - Page payload type is valid.
 * - A matching audit event exists and references the deleted Todo id.
 * - The actor_user_id (if present) matches the user who performed the deletion.
 * - No Todo content (title/notes) is exposed in the audit event.
 */
export async function test_api_audit_event_listing_after_user_todo_deletion(
  connection: api.IConnection,
) {
  // 1) Register a user (session token handled by SDK)
  const userEmail = typia.random<string & tags.Format<"email">>();
  const userPassword = RandomGenerator.alphaNumeric(12); // >= 8 chars
  const userAuth = await api.functional.auth.user.join(connection, {
    body: {
      email: userEmail,
      password: userPassword,
    } satisfies ITodoMvpUser.ICreate,
  });
  typia.assert(userAuth);

  // 2) Create a Todo as the user
  const createTodoBody = {
    title: RandomGenerator.paragraph({ sentences: 3 }),
  } satisfies ITodoMvpTodo.ICreate;
  const todo = await api.functional.todoMvp.user.todos.create(connection, {
    body: createTodoBody,
  });
  typia.assert(todo);

  // 3) Delete the Todo as the user
  await api.functional.todoMvp.user.todos.erase(connection, {
    todoId: todo.id,
  });

  // 4) Register an admin (switch context to admin)
  const adminEmail = typia.random<string & tags.Format<"email">>();
  const adminPassword = RandomGenerator.alphaNumeric(12);
  const adminAuth = await api.functional.auth.admin.join(connection, {
    body: {
      email: adminEmail,
      password: adminPassword,
    } satisfies ITodoMvpAdminJoin.ICreate,
  });
  typia.assert(adminAuth);

  // 5) List audit events with filters for the deletion event
  const request = {
    page: 1 satisfies number,
    limit: 50 satisfies number,
    target_todo_id: todo.id,
    event_types: ["todo_deleted"],
    sort_by: "created_at",
    order: "desc",
  } satisfies ITodoMvpAuditEvent.IRequest;
  const page = await api.functional.todoMvp.admin.auditEvents.index(
    connection,
    {
      body: request,
    },
  );
  typia.assert(page);

  // Must contain at least one matching event
  const found = page.data.find(
    (ev) => ev.event_type === "todo_deleted" && ev.todo_mvp_todo_id === todo.id,
  );
  TestValidator.predicate(
    "audit list contains deletion event for target todo",
    found !== undefined,
  );

  if (found !== undefined) {
    // Re-assert the event structure at runtime (and narrow the type)
    typia.assert(found);

    // Target todo id must match
    const targetId = typia.assert<string & tags.Format<"uuid">>(
      found.todo_mvp_todo_id!,
    );
    TestValidator.equals(
      "audit event points to deleted todo id",
      targetId,
      todo.id,
    );

    // Actor should be the user (if present)
    if (
      found.todo_mvp_user_id !== null &&
      found.todo_mvp_user_id !== undefined
    ) {
      TestValidator.equals(
        "actor user id matches deleter",
        found.todo_mvp_user_id,
        userAuth.id,
      );
    }

    // Ensure no content fields from Todo are exposed
    TestValidator.predicate(
      "audit event does not expose todo content fields",
      !("title" in found) && !("notes" in found),
    );
  }
}
