import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ITodoMvpTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpTodo";
import { IETodoMvpTodoStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IETodoMvpTodoStatus";
import { UserPayload } from "../decorators/payload/UserPayload";

export async function getTodoMvpUserTodosTodoId(props: {
  user: UserPayload;
  todoId: string & tags.Format<"uuid">;
}): Promise<ITodoMvpTodo> {
  /**
   * Get a single Todo from table todo_mvp_todos by id with full details.
   *
   * Retrieves one Todo owned by the authenticated user. Ensures ownership by
   * filtering with both the Todo id and the caller's user id. Returns the
   * complete representation including optional fields and timestamps.
   *
   * @param props - Request properties
   * @param props.user - The authenticated user payload (owner)
   * @param props.todoId - UUID of the Todo to retrieve
   * @returns Full Todo resource matching ITodoMvpTodo
   * @throws {HttpException} 404 when not found or not owned by the user
   * @throws {HttpException} 500 when encountering invalid persisted status
   */
  const { user, todoId } = props;

  // Helper to narrow status to the allowed union strictly without assertions
  const ensureStatus = (value: string): IETodoMvpTodoStatus => {
    if (value === "open" || value === "completed") return value;
    throw new HttpException("Invalid status stored for Todo", 500);
  };

  const row = await MyGlobal.prisma.todo_mvp_todos.findFirst({
    where: {
      id: todoId,
      todo_mvp_user_id: user.id,
    },
    select: {
      id: true,
      title: true,
      notes: true,
      status: true,
      due_date: true,
      completed_at: true,
      created_at: true,
      updated_at: true,
    },
  });

  if (row === null) {
    throw new HttpException("Not Found", 404);
  }

  return {
    // Use the branded path parameter to avoid assertions
    id: todoId,
    title: row.title,
    notes: row.notes ?? null,
    status: ensureStatus(row.status),
    due_date: row.due_date ? toISOStringSafe(row.due_date) : null,
    completed_at: row.completed_at ? toISOStringSafe(row.completed_at) : null,
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
  };
}
