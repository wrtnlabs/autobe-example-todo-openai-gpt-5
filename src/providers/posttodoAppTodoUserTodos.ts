import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodo";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

export async function posttodoAppTodoUserTodos(props: {
  todoUser: TodouserPayload;
  body: ITodoAppTodo.ICreate;
}): Promise<ITodoAppTodo> {
  /**
   * Create a new Todo (todo_app_todos) owned by the authenticated user.
   *
   * Initializes status to "open", sets created_at/updated_at timestamps, and
   * leaves completed_at as null. Ownership is assigned from the authenticated
   * todouser payload (todoUser.id). Optional fields (description, due_at) are
   * validated.
   *
   * Authorization: caller must be a todouser.
   *
   * @param props - Request properties
   * @param props.todoUser - Authenticated todouser payload (owner id source)
   * @param props.body - Creation payload (title required; optional description,
   *   due_at)
   * @returns The created Todo entity
   * @throws {HttpException} 403 when caller is not a todouser
   * @throws {HttpException} 400 when validation fails
   *   (title/description/due_at)
   */
  const { todoUser, body } = props;

  // Authorization check
  if (!todoUser || todoUser.type !== "todouser") {
    throw new HttpException("Forbidden: Only todouser can create todos", 403);
  }

  // Validate title (trim → length 1..120)
  const trimmedTitle = body.title.trim();
  if (trimmedTitle.length < 1 || trimmedTitle.length > 120) {
    throw new HttpException(
      "Bad Request: title must be 1–120 characters after trimming",
      400,
    );
  }

  // Validate description length if provided (<= 2000)
  if (body.description !== undefined && body.description !== null) {
    if (body.description.length > 2000) {
      throw new HttpException(
        "Bad Request: description must be at most 2000 characters",
        400,
      );
    }
  }

  // Validate due_at format if provided (ISO 8601 date-time)
  if (body.due_at !== undefined && body.due_at !== null) {
    const isValidDateTime = typia.is<string & tags.Format<"date-time">>(
      body.due_at,
    );
    if (!isValidDateTime) {
      throw new HttpException(
        "Bad Request: due_at must be a valid ISO 8601 date-time string",
        400,
      );
    }
  }

  // Prepare values
  const id = v4() as string & tags.Format<"uuid">;
  const now = toISOStringSafe(new Date());
  const dueAtValue =
    body.due_at !== undefined && body.due_at !== null
      ? toISOStringSafe(body.due_at)
      : null;

  // Create record
  const created = await MyGlobal.prisma.todo_app_todos.create({
    data: {
      id,
      todo_app_user_id: todoUser.id,
      title: trimmedTitle,
      description: body.description ?? null,
      due_at: dueAtValue,
      status: "open",
      completed_at: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
  });

  // Map to API structure with proper date conversions and null handling
  return {
    id: created.id as string & tags.Format<"uuid">,
    todo_app_user_id: created.todo_app_user_id as string & tags.Format<"uuid">,
    title: created.title,
    description: created.description ?? null,
    due_at: created.due_at ? toISOStringSafe(created.due_at) : null,
    status: created.status,
    completed_at: created.completed_at
      ? toISOStringSafe(created.completed_at)
      : null,
    created_at: toISOStringSafe(created.created_at),
    updated_at: toISOStringSafe(created.updated_at),
    deleted_at: created.deleted_at ? toISOStringSafe(created.deleted_at) : null,
  };
}
