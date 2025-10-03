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
 * Admin can access audit event detail for a deleted Todo.
 *
 * Workflow:
 *
 * 1. Join as a regular user and create a Todo
 * 2. Delete the Todo to generate an audit event (todo_deleted)
 * 3. While still a user, verify RBAC by asserting admin audit list is inaccessible
 * 4. Join as admin
 * 5. List audit events filtering by target Todo id and event type
 * 6. Retrieve detail by id and compare with list item for consistency
 */
export async function test_api_audit_event_detail_access_by_admin(
  connection: api.IConnection,
) {
  // 1) Join as a regular user
  const userJoin = await api.functional.auth.user.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: "Passw0rd-" + RandomGenerator.alphaNumeric(8),
    } satisfies ITodoMvpUser.ICreate,
  });
  typia.assert(userJoin);

  // 2) Create a Todo
  const todo = await api.functional.todoMvp.user.todos.create(connection, {
    body: {
      title: RandomGenerator.name(2),
    } satisfies ITodoMvpTodo.ICreate,
  });
  typia.assert(todo);

  // 3) Delete the Todo to generate an audit event
  await api.functional.todoMvp.user.todos.erase(connection, {
    todoId: todo.id,
  });

  // 4) RBAC: user should not access admin audit endpoints
  await TestValidator.error("user cannot list admin audit events", async () => {
    await api.functional.todoMvp.admin.auditEvents.index(connection, {
      body: {
        limit: 1,
        page: 1,
      } satisfies ITodoMvpAuditEvent.IRequest,
    });
  });

  // 5) Join as admin
  const adminJoin = await api.functional.auth.admin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: "Adm1n-" + RandomGenerator.alphaNumeric(10),
    } satisfies ITodoMvpAdminJoin.ICreate,
  });
  typia.assert(adminJoin);

  // 6) List audit events with filters to find the deletion event
  const eventTypes = ["todo_deleted"] as const;
  const maxAttempts = 5;
  const retryDelayMs = 100;
  let found: ITodoMvpAuditEvent | undefined = undefined;
  for (let attempt = 0; attempt < maxAttempts && !found; attempt++) {
    const page = await api.functional.todoMvp.admin.auditEvents.index(
      connection,
      {
        body: {
          page: 1,
          limit: 20,
          target_todo_id: todo.id,
          event_types: [...eventTypes],
          sort_by: "created_at",
          order: "desc",
        } satisfies ITodoMvpAuditEvent.IRequest,
      },
    );
    typia.assert(page);

    found = page.data.find(
      (e) => e.todo_mvp_todo_id === todo.id && e.event_type === "todo_deleted",
    );

    if (!found && attempt < maxAttempts - 1)
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }

  if (!found) throw new Error("Audit event for deleted todo not found");

  // 7) Retrieve detail by id
  const detail = await api.functional.todoMvp.admin.auditEvents.at(connection, {
    auditEventId: found.id,
  });
  typia.assert(detail);

  // 8) Validate consistency between list and detail
  TestValidator.equals("detail id equals list id", detail.id, found.id);
  TestValidator.equals(
    "detail event_type equals list event_type",
    detail.event_type,
    found.event_type,
  );
  TestValidator.equals(
    "detail target_todo_id equals list target_todo_id",
    detail.todo_mvp_todo_id,
    found.todo_mvp_todo_id ?? null,
  );
}
