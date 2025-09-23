import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppAuditLog } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppAuditLog";
import type { ITodoAppAuditLog } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAuditLog";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Search audit logs by admin actor, member target, and a concrete Todo
 * resource, expecting empty results.
 *
 * Purpose:
 *
 * - Prove that a system admin can query audit logs with combined filters and
 *   receive a valid empty page when no matching entries exist, verifying
 *   pagination integrity and non-exposure of sensitive fields.
 *
 * Flow:
 *
 * 1. Admin joins (auth.systemAdmin.join) to obtain admin id and set admin token.
 * 2. Member joins (auth.todoUser.join) to obtain member id and set member token.
 * 3. Member creates a Todo (todoApp.todoUser.todos.create) to get resource_id
 *    (todo.id).
 * 4. Switch back to admin by joining again (auth.systemAdmin.join).
 * 5. Admin calls auditLogs.index with filters: actor_user_id=admin.id,
 *    target_user_id=member.id, resource_type="todo", resource_id=todo.id,
 *    page=1, limit=20, sort_by=created_at desc.
 * 6. Validate the response page structure with empty data and coherent pagination.
 */
export async function test_api_audit_log_search_by_actor_target_and_resource_with_empty_result(
  connection: api.IConnection,
) {
  // 1) Admin joins
  const adminEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const adminPassword: string & tags.MinLength<8> & tags.MaxLength<64> =
    typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>();

  const adminAuth = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: adminEmail,
      password: adminPassword,
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(adminAuth);

  // 2) Member joins (context switches to member token)
  const memberEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const memberPassword: string & tags.MinLength<8> & tags.MaxLength<64> =
    typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>();

  const memberAuth = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: memberEmail,
      password: memberPassword,
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(memberAuth);

  // 3) Member creates a Todo
  const todo = await api.functional.todoApp.todoUser.todos.create(connection, {
    body: {
      title: RandomGenerator.paragraph({
        sentences: 3,
        wordMin: 3,
        wordMax: 6,
      }),
      description: RandomGenerator.paragraph({
        sentences: 8,
        wordMin: 3,
        wordMax: 8,
      }),
      due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    } satisfies ITodoAppTodo.ICreate,
  });
  typia.assert(todo);

  // 4) Switch back to admin
  const adminAuthAgain = await api.functional.auth.systemAdmin.join(
    connection,
    {
      body: {
        email: adminEmail,
        password: adminPassword,
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    },
  );
  typia.assert(adminAuthAgain);

  // 5) Admin searches audit logs with combined filters
  const requestBody = {
    page: 1,
    limit: 20,
    actor_user_id: adminAuth.id,
    target_user_id: memberAuth.id,
    resource_type: "todo",
    resource_id: todo.id,
    sort_by: "created_at",
    sort_dir: "desc",
  } satisfies ITodoAppAuditLog.IRequest;

  const page = await api.functional.todoApp.systemAdmin.auditLogs.index(
    connection,
    {
      body: requestBody,
    },
  );
  typia.assert(page);

  // 6) Business validations for empty result and pagination coherence
  TestValidator.equals(
    "audit logs search returns empty data",
    page.data.length,
    0,
  );
  TestValidator.equals(
    "audit logs pagination records count should be zero",
    page.pagination.records,
    0,
  );
  TestValidator.predicate(
    "audit logs pagination current is non-negative",
    page.pagination.current >= 0,
  );
  TestValidator.predicate(
    "audit logs pagination limit is within [1, 100]",
    page.pagination.limit >= 1 && page.pagination.limit <= 100,
  );
  TestValidator.equals(
    "audit logs pagination pages should be zero for empty result",
    page.pagination.pages,
    0,
  );
}
