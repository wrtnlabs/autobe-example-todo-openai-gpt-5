import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

/**
 * Get a single Todo (todo_app_todos) by id for the authenticated owner.
 *
 * Retrieves a Todo ensuring it belongs to the requesting user and is not
 * soft-deleted. Returns full ITodoAppTodo fields. Access is denied without
 * existence disclosure when the record does not exist, is soft-deleted, or is
 * owned by another user.
 *
 * @param props - Request properties
 * @param props.todoUser - The authenticated todo user (owner context)
 * @param props.todoId - Identifier of the target Todo (UUID)
 * @returns The detailed Todo entity
 * @throws {HttpException} 404 when not found or not accessible by the caller
 */
export async function gettodoAppTodoUserTodosTodoId(props: {
  todoUser: TodouserPayload;
  todoId: string & tags.Format<"uuid">;
}): Promise<ITodoAppTodo> {
  const row = await MyGlobal.prisma.todo_app_todos.findFirst({
    where: {
      id: props.todoId,
      todo_app_user_id: props.todoUser.id,
      deleted_at: null,
    },
    select: {
      id: true,
      todo_app_user_id: true,
      title: true,
      description: true,
      due_at: true,
      status: true,
      completed_at: true,
      created_at: true,
      updated_at: true,
      deleted_at: true,
    },
  });

  if (!row) {
    throw new HttpException("Not Found", 404);
  }

  return {
    id: typia.assert<string & tags.Format<"uuid">>(row.id),
    todo_app_user_id: typia.assert<string & tags.Format<"uuid">>(
      row.todo_app_user_id,
    ),
    title: row.title,
    description: row.description ?? null,
    due_at: row.due_at ? toISOStringSafe(row.due_at) : null,
    status: row.status,
    completed_at: row.completed_at ? toISOStringSafe(row.completed_at) : null,
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
    deleted_at: row.deleted_at ? toISOStringSafe(row.deleted_at) : null,
  };
}
