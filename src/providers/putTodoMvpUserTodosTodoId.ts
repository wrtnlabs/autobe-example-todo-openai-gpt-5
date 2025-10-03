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

export async function putTodoMvpUserTodosTodoId(props: {
  user: UserPayload;
  todoId: string & tags.Format<"uuid">;
  body: ITodoMvpTodo.IUpdate;
}): Promise<ITodoMvpTodo> {
  const { user, todoId, body } = props;

  // 1) Fetch existing Todo ensuring ownership (404 if not found or not owned)
  const existing = await MyGlobal.prisma.todo_mvp_todos.findFirst({
    where: {
      id: todoId,
      todo_mvp_user_id: user.id,
    },
  });
  if (existing === null) throw new HttpException("Not Found", 404);

  // 2) Validate input according to business rules
  // Title: trim and enforce 1–120 chars if provided
  let nextTitle: string | undefined = undefined;
  if (body.title !== undefined) {
    const t = body.title.trim();
    if (t.length < 1 || t.length > 120)
      throw new HttpException(
        "Bad Request: title must be 1-120 characters after trimming",
        400,
      );
    nextTitle = t;
  }

  // Notes: <= 1000 chars when provided and not null
  if (body.notes !== undefined && body.notes !== null) {
    if (body.notes.length > 1000)
      throw new HttpException(
        "Bad Request: notes must be <= 1000 characters",
        400,
      );
  }

  // Status: only "open" or "completed" when provided
  if (
    body.status !== undefined &&
    body.status !== "open" &&
    body.status !== "completed"
  )
    throw new HttpException(
      "Bad Request: status must be 'open' or 'completed'",
      400,
    );

  // due_date: validate parseability when provided and not null
  if (body.due_date !== undefined && body.due_date !== null) {
    const ms = Date.parse(body.due_date);
    if (Number.isNaN(ms))
      throw new HttpException(
        "Bad Request: due_date must be a valid date-time string",
        400,
      );
  }

  // 3) Compute timestamps and status transitions
  const now = toISOStringSafe(new Date());
  const finalStatus: IETodoMvpTodoStatus =
    body.status !== undefined
      ? body.status
      : existing.status === "completed"
        ? "completed"
        : "open";

  // completed_at transition policy
  let completedAtUpdate:
    | (string & tags.Format<"date-time">)
    | null
    | undefined = undefined;
  if (body.status !== undefined) {
    if (body.status === "completed" && existing.completed_at === null) {
      completedAtUpdate = now; // set when transitioning to completed
    } else if (body.status === "open") {
      completedAtUpdate = null; // clear when reopening
    }
  }

  // 4) Persist changes
  const updated = await MyGlobal.prisma.todo_mvp_todos.update({
    where: { id: todoId },
    data: {
      title: nextTitle === undefined ? undefined : nextTitle,
      notes: body.notes === undefined ? undefined : body.notes, // null clears
      status: body.status ?? undefined,
      due_date:
        body.due_date === undefined
          ? undefined
          : body.due_date === null
            ? null
            : toISOStringSafe(body.due_date),
      completed_at: completedAtUpdate, // undefined = no change
      updated_at: now,
    },
  });

  // 5) Build response with proper date conversions and null/undefined handling
  const responseCompletedAt =
    completedAtUpdate !== undefined
      ? completedAtUpdate
      : updated.completed_at
        ? toISOStringSafe(updated.completed_at)
        : null;

  return {
    id: todoId,
    title: updated.title,
    notes: updated.notes ?? null,
    status: finalStatus,
    due_date: updated.due_date ? toISOStringSafe(updated.due_date) : null,
    completed_at: responseCompletedAt,
    created_at: toISOStringSafe(updated.created_at),
    updated_at: now,
  };
}
