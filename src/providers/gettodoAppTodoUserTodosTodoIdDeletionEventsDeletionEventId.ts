import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppTodoDeletionEvent } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoDeletionEvent";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

/**
 * Get a specific Todo deletion audit entry (todo_app_todo_deletion_events) by
 * identifiers.
 *
 * Retrieves a single deletion audit entry scoped to the given Todo and ensures
 * the authenticated todoUser owns the parent Todo. Soft-deleted audit records
 * (deleted_at not null) are excluded. If the Todo is not owned by the caller,
 * or if the deletion event does not exist for the given Todo, a 404 is thrown
 * to avoid information leakage.
 *
 * @param props - Request properties
 * @param props.todoUser - Authenticated Todo user payload (must own the Todo)
 * @param props.todoId - UUID of the parent Todo
 * @param props.deletionEventId - UUID of the deletion audit event to retrieve
 * @returns The deletion audit entry matching the provided identifiers
 * @throws {HttpException} 404 when the Todo is not found/owned by user
 * @throws {HttpException} 404 when the deletion event is not found for the Todo
 */
export async function gettodoAppTodoUserTodosTodoIdDeletionEventsDeletionEventId(props: {
  todoUser: TodouserPayload;
  todoId: string & tags.Format<"uuid">;
  deletionEventId: string & tags.Format<"uuid">;
}): Promise<ITodoAppTodoDeletionEvent> {
  const { todoUser, todoId, deletionEventId } = props;

  // Authorization: ensure the caller owns the parent Todo
  const todo = await MyGlobal.prisma.todo_app_todos.findFirst({
    where: {
      id: todoId,
      todo_app_user_id: todoUser.id,
    },
    select: { id: true },
  });
  if (!todo) {
    throw new HttpException("Not Found", 404);
  }

  // Retrieve the deletion event scoped to the given Todo, excluding soft-deleted records
  const ev = await MyGlobal.prisma.todo_app_todo_deletion_events.findFirst({
    where: {
      id: deletionEventId,
      todo_app_todo_id: todoId,
      deleted_at: null,
    },
  });
  if (!ev) {
    throw new HttpException("Not Found", 404);
  }

  // Map to API structure with proper date-time conversions
  const result: ITodoAppTodoDeletionEvent = {
    id: ev.id as string & tags.Format<"uuid">,
    todo_app_todo_id:
      ev.todo_app_todo_id === null
        ? null
        : (ev.todo_app_todo_id as string & tags.Format<"uuid">),
    todo_app_user_id:
      ev.todo_app_user_id === null
        ? null
        : (ev.todo_app_user_id as string & tags.Format<"uuid">),
    reason: ev.reason === null ? null : ev.reason,
    occurred_at: toISOStringSafe(ev.occurred_at),
    created_at: toISOStringSafe(ev.created_at),
    updated_at: toISOStringSafe(ev.updated_at),
    deleted_at: ev.deleted_at ? toISOStringSafe(ev.deleted_at) : null,
  };

  return result;
}
