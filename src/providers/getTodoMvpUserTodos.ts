import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { IPageITodoMvpTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoMvpTodo";
import { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import { ITodoMvpTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpTodo";
import { IETodoMvpTodoStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IETodoMvpTodoStatus";
import { UserPayload } from "../decorators/payload/UserPayload";

export async function getTodoMvpUserTodos(props: {
  user: UserPayload;
}): Promise<IPageITodoMvpTodo> {
  const { user } = props;

  // Authentication and authorization checks
  if (!user || user.type !== "user") {
    throw new HttpException("Unauthorized: user authentication required", 401);
  }

  const dbUser = await MyGlobal.prisma.todo_mvp_users.findFirst({
    where: {
      id: user.id,
      status: "active",
      deleted_at: null,
    },
  });
  if (dbUser === null) {
    throw new HttpException("Forbidden: inactive or deleted user", 403);
  }

  // Fetch data & total in parallel
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_mvp_todos.findMany({
      where: { todo_mvp_user_id: user.id },
      orderBy: { created_at: "desc" },
    }),
    MyGlobal.prisma.todo_mvp_todos.count({
      where: { todo_mvp_user_id: user.id },
    }),
  ]);

  const data: ITodoMvpTodo[] = rows.map((r) => {
    const status: IETodoMvpTodoStatus =
      r.status === "completed" ? "completed" : "open";
    return {
      id: r.id,
      title: r.title,
      notes: r.notes ?? undefined,
      status,
      due_date: r.due_date ? toISOStringSafe(r.due_date) : undefined,
      completed_at: r.completed_at
        ? toISOStringSafe(r.completed_at)
        : undefined,
      created_at: toISOStringSafe(r.created_at),
      updated_at: toISOStringSafe(r.updated_at),
    };
  });

  // Simple pagination metadata without inputs: one page containing all records
  const records = total;
  const limit = total; // show all; avoids division by zero and keeps pages consistent
  const pages = records === 0 ? 0 : 1;

  const pagination: IPage.IPagination = {
    current: 1,
    limit: Number(limit),
    records: Number(records),
    pages: Number(pages),
  };

  return { pagination, data };
}
