import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

export async function deletetodoAppTodoUserTodosTodoId(props: {
  todoUser: TodouserPayload;
  todoId: string & tags.Format<"uuid">;
}): Promise<void> {
  const { todoUser, todoId } = props;

  /**
   * Delete a Todo by ID in todo_app_todos using soft deletion and record audit
   * entries
   *
   * Soft-deletes the specified Todo owned by the authenticated user by setting
   * deleted_at and recording audit artifacts in todo_app_todo_deletion_events
   * and todo_app_todo_activities. Operation is idempotent: if already deleted,
   * succeeds without additional changes.
   *
   * Authorization: only the owner (todoUser) can delete the Todo. If not owned
   * or not found, responds with Not Found (404) without leaking existence.
   *
   * @param props - Request properties
   * @param props.todoUser - Authenticated todo user payload (owner)
   * @param props.todoId - UUID of the Todo to delete
   * @returns Void on success
   * @throws {HttpException} 404 when the Todo does not exist for this user
   */

  // Verify ownership and existence without leaking info
  const todo = await MyGlobal.prisma.todo_app_todos.findFirst({
    where: {
      id: todoId,
      todo_app_user_id: todoUser.id,
    },
    select: { id: true, deleted_at: true },
  });

  if (!todo) {
    throw new HttpException("Not Found", 404);
  }

  // Idempotent: if already soft-deleted, no further action
  if (todo.deleted_at !== null) {
    return;
  }

  // Prepare timestamps once
  const now = toISOStringSafe(new Date());

  await MyGlobal.prisma.$transaction(async (tx) => {
    // 1) Soft delete the Todo (update deleted_at and updated_at)
    await tx.todo_app_todos.update({
      where: { id: todoId },
      data: {
        deleted_at: now,
        updated_at: now,
      },
    });

    // 2) Record deletion audit event
    await tx.todo_app_todo_deletion_events.create({
      data: {
        id: v4(),
        todo_app_todo_id: todoId,
        todo_app_user_id: todoUser.id,
        occurred_at: now,
        created_at: now,
        updated_at: now,
      },
    });

    // 3) Record activity (append-only)
    await tx.todo_app_todo_activities.create({
      data: {
        id: v4(),
        todo_app_todo_id: todoId,
        todo_app_user_id: todoUser.id,
        activity_type: "delete",
        occurred_at: now,
        created_at: now,
        updated_at: now,
      },
    });

    // 4) Optional business event emission is omitted (no event type context)
  });
}
