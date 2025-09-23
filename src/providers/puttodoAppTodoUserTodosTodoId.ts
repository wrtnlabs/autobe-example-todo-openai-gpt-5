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
 * Update a Todo (todo_app_todos) by id for the authenticated owner.
 *
 * Updates mutable fields (title, description, due_at) and handles status
 * transitions between 'open' and 'completed'. Maintains updated_at and
 * sets/clears completed_at accordingly. Only the owning user can update a Todo,
 * and soft-deleted records are not updatable (not found behavior).
 *
 * @param props - Request properties
 * @param props.todoUser - Authenticated Todo user payload (owner context)
 * @param props.todoId - Identifier of the target Todo (UUID)
 * @param props.body - Fields to update on the Todo
 * @returns The updated Todo entity in API format
 * @throws {HttpException} 404 Not Found when resource does not exist, is
 *   soft-deleted, or not owned by caller
 */
export async function puttodoAppTodoUserTodosTodoId(props: {
  todoUser: TodouserPayload;
  todoId: string & tags.Format<"uuid">;
  body: ITodoAppTodo.IUpdate;
}): Promise<ITodoAppTodo> {
  const { todoUser, todoId, body } = props;

  // Enforce ownership and non-deleted state without leaking existence
  const owned = await MyGlobal.prisma.todo_app_todos.findFirst({
    where: {
      id: todoId,
      todo_app_user_id: todoUser.id,
      deleted_at: null,
    },
    select: { id: true },
  });
  if (!owned) {
    throw new HttpException("Not Found", 404);
  }

  // Prepare timestamps
  const now = toISOStringSafe(new Date());
  let completedAt: (string & tags.Format<"date-time">) | null | undefined =
    undefined;
  if (body.status !== undefined && body.status !== null) {
    completedAt = body.status === "completed" ? now : null;
  }

  const updated = await MyGlobal.prisma.todo_app_todos.update({
    where: { id: todoId },
    data: {
      // Required string fields: convert null -> undefined to skip
      title: body.title === null ? undefined : (body.title ?? undefined),
      status: body.status === null ? undefined : (body.status ?? undefined),

      // Nullable fields: propagate null, convert provided date strings
      description: body.description ?? undefined,
      due_at:
        body.due_at === undefined
          ? undefined
          : body.due_at === null
            ? null
            : toISOStringSafe(body.due_at),

      // Status-driven completion timestamp when explicitly transitioning
      ...(completedAt !== undefined && { completed_at: completedAt }),

      // System-managed timestamp
      updated_at: now,
    },
  });

  return {
    id: updated.id as string & tags.Format<"uuid">,
    todo_app_user_id: updated.todo_app_user_id as string & tags.Format<"uuid">,
    title: updated.title,
    description: updated.description ?? null,
    due_at: updated.due_at ? toISOStringSafe(updated.due_at) : null,
    status: updated.status,
    completed_at: updated.completed_at
      ? toISOStringSafe(updated.completed_at)
      : null,
    created_at: toISOStringSafe(updated.created_at),
    updated_at: now,
    deleted_at: updated.deleted_at ? toISOStringSafe(updated.deleted_at) : null,
  };
}
