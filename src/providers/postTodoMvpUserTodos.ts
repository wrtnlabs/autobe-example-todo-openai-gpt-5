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

export async function postTodoMvpUserTodos(props: {
  user: UserPayload;
  body: ITodoMvpTodo.ICreate;
}): Promise<ITodoMvpTodo> {
  const { user, body } = props;

  // Authorization: ensure authenticated user exists, active, and not soft-deleted
  const owner = await MyGlobal.prisma.todo_mvp_users.findFirst({
    where: {
      id: user.id,
      status: "active",
      deleted_at: null,
    },
    select: { id: true },
  });
  if (owner === null) {
    throw new HttpException("Forbidden: user not active or not found", 403);
  }

  // Validate and normalize title
  const trimmedTitle = body.title.trim();
  if (trimmedTitle.length < 1 || trimmedTitle.length > 120) {
    throw new HttpException(
      "Bad Request: title must be 1-120 characters after trimming",
      400,
    );
  }

  // Normalize notes (optional), whitespace-only treated as empty → null, enforce max length 1000
  let normalizedNotes: (string & tags.MaxLength<1000>) | null;
  if (body.notes === undefined || body.notes === null) {
    normalizedNotes = null;
  } else {
    const n = body.notes.trim();
    if (n.length === 0) normalizedNotes = null;
    else if (n.length > 1000)
      throw new HttpException(
        "Bad Request: notes must be at most 1000 characters",
        400,
      );
    else normalizedNotes = n as unknown as string & tags.MaxLength<1000>;
  }

  // Validate and normalize due_date (optional)
  let normalizedDueDate: (string & tags.Format<"date-time">) | null;
  if (body.due_date === undefined || body.due_date === null) {
    normalizedDueDate = null;
  } else {
    const time = new Date(body.due_date).getTime();
    if (Number.isNaN(time)) {
      throw new HttpException("Bad Request: invalid due_date", 400);
    }
    normalizedDueDate = toISOStringSafe(body.due_date);
  }

  // System timestamps and identifiers
  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());
  const id = v4() as string & tags.Format<"uuid">;

  // Create the Todo owned by the authenticated user
  const created = await MyGlobal.prisma.todo_mvp_todos.create({
    data: {
      id,
      todo_mvp_user_id: user.id,
      title: trimmedTitle,
      notes: normalizedNotes,
      status: "open",
      due_date: normalizedDueDate,
      completed_at: null,
      created_at: now,
      updated_at: now,
    },
    select: { id: true },
  });

  // Build response using prepared values to avoid Date conversions from Prisma
  const result: ITodoMvpTodo = {
    id: created.id as string & tags.Format<"uuid">,
    title: trimmedTitle as string & tags.MinLength<1> & tags.MaxLength<120>,
    notes: normalizedNotes ?? null,
    status: "open",
    due_date: normalizedDueDate ?? null,
    completed_at: null,
    created_at: now,
    updated_at: now,
  };
  return result;
}
