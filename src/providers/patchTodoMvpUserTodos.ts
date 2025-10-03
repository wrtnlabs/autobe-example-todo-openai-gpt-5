import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ITodoMvpTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpTodo";
import { IETodoMvpTodoStatusFilter } from "@ORGANIZATION/PROJECT-api/lib/structures/IETodoMvpTodoStatusFilter";
import { IETodoMvpTodoSortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IETodoMvpTodoSortBy";
import { IESortOrder } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortOrder";
import { IPageITodoMvpTodo } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoMvpTodo";
import { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import { IETodoMvpTodoStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IETodoMvpTodoStatus";
import { UserPayload } from "../decorators/payload/UserPayload";

export async function patchTodoMvpUserTodos(props: {
  user: UserPayload;
  body: ITodoMvpTodo.IRequest;
}): Promise<IPageITodoMvpTodo.ISummary> {
  /**
   * List/search the authenticated user’s Todos with pagination and minimal
   * filters.
   *
   * Security: Only returns rows owned by the authenticated user
   * (todo_mvp_user_id = user.id). Sorting supports created_at (default),
   * due_date, completed_at with asc/desc order. Pagination uses page (>=1) and
   * limit (1..200).
   *
   * @param props - Request properties
   * @param props.user - Authenticated user payload (role: user)
   * @param props.body - Search, filter, sort, and pagination parameters
   * @returns Paginated collection of Todo summaries
   * @throws {HttpException} 401 when authentication context is missing or
   *   invalid
   * @throws {HttpException} 400 on invalid filter/sort/pagination parameters
   */
  const { user, body } = props;

  // Authorization & basic context validation
  if (!user || user.type !== "user") {
    throw new HttpException("Unauthorized: user context required", 401);
  }

  // Validate and normalize filters
  const allowedStatus: Array<IETodoMvpTodoStatusFilter> = [
    "all",
    "open",
    "completed",
  ];
  const allowedSortBy: Array<IETodoMvpTodoSortBy> = [
    "created_at",
    "due_date",
    "completed_at",
  ];
  const allowedOrder: Array<IESortOrder> = ["asc", "desc"];

  const status: IETodoMvpTodoStatusFilter =
    body.status !== undefined && body.status !== null ? body.status : "all";
  if (!allowedStatus.includes(status)) {
    throw new HttpException("Bad Request: Invalid status filter", 400);
  }

  const sortBy: IETodoMvpTodoSortBy =
    body.sort_by !== undefined && body.sort_by !== null
      ? body.sort_by
      : "created_at";
  if (!allowedSortBy.includes(sortBy)) {
    throw new HttpException("Bad Request: Invalid sort_by value", 400);
  }

  const order: IESortOrder =
    body.order !== undefined && body.order !== null ? body.order : "desc";
  if (!allowedOrder.includes(order)) {
    throw new HttpException("Bad Request: Invalid order value", 400);
  }

  // Pagination defaults and validation
  const pageInput =
    body.page !== undefined && body.page !== null ? body.page : 1;
  const limitInput =
    body.limit !== undefined && body.limit !== null ? body.limit : 100;

  if (typeof pageInput !== "number" || pageInput < 1) {
    throw new HttpException("Bad Request: page must be a number >= 1", 400);
  }
  if (typeof limitInput !== "number" || limitInput < 1 || limitInput > 200) {
    throw new HttpException(
      "Bad Request: limit must be a number between 1 and 200",
      400,
    );
  }

  const page = Number(pageInput);
  const limit = Number(limitInput);
  const skip = Number((page - 1) * limit);

  // Build WHERE condition (reuse for findMany and count)
  const whereCondition = {
    todo_mvp_user_id: user.id,
    ...(status === "open" && { status: "open" as IETodoMvpTodoStatus }),
    ...(status === "completed" && {
      status: "completed" as IETodoMvpTodoStatus,
    }),
  };

  // Execute queries in parallel
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_mvp_todos.findMany({
      where: whereCondition,
      select: {
        id: true,
        title: true,
        status: true,
        due_date: true,
        completed_at: true,
        created_at: true,
      },
      orderBy:
        sortBy === "created_at"
          ? { created_at: order }
          : sortBy === "due_date"
            ? { due_date: order }
            : { completed_at: order },
      skip,
      take: limit,
    }),
    MyGlobal.prisma.todo_mvp_todos.count({ where: whereCondition }),
  ]);

  // Map to DTO summaries with proper Date conversions
  const data: ITodoMvpTodo.ISummary[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status as IETodoMvpTodoStatus,
    due_date: r.due_date ? toISOStringSafe(r.due_date) : null,
    completed_at: r.completed_at ? toISOStringSafe(r.completed_at) : null,
    created_at: toISOStringSafe(r.created_at),
  }));

  const records = Number(total);
  const pages = limit > 0 ? Math.ceil(records / limit) : 0;

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: Number(records),
      pages: Number(pages),
    },
    data,
  };
}
