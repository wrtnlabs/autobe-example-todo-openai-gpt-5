import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppTodoDeletionEvent } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoDeletionEvent";
import { IPageITodoAppTodoDeletionEvent } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppTodoDeletionEvent";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

/**
 * List deletion audit entries for a Todo from todo_app_todo_deletion_events
 *
 * Retrieve a filtered, paginated list of deletion audit entries for a specific
 * Todo. Only the owner (todoUser) may access this endpoint. Results support
 * pagination, date range filtering on occurred_at, free-text search on reason,
 * and sorting.
 *
 * Authorization: The Todo must belong to the authenticated todoUser. If not
 * found or not owned, respond with 404 to avoid leaking existence.
 *
 * @param props - Request properties
 * @param props.todoUser - The authenticated todo user making the request
 * @param props.todoId - Identifier of the parent todo
 * @param props.body - Search, filter, sort, and pagination parameters
 * @returns Paginated deletion event summaries for the requested Todo
 * @throws {HttpException} 404 when the todo is not found or not owned by caller
 */
export async function patchtodoAppTodoUserTodosTodoIdDeletionEvents(props: {
  todoUser: TodouserPayload;
  todoId: string & tags.Format<"uuid">;
  body: ITodoAppTodoDeletionEvent.IRequest;
}): Promise<IPageITodoAppTodoDeletionEvent.ISummary> {
  const { todoUser, todoId, body } = props;

  // Authorization: ensure the Todo belongs to the authenticated user
  const owned = await MyGlobal.prisma.todo_app_todos.findFirst({
    where: {
      id: todoId,
      todo_app_user_id: todoUser.id,
    },
    select: { id: true },
  });
  if (!owned) throw new HttpException("Not Found", 404);

  // Pagination defaults and clamping
  const clamp = (value: number, min: number, max: number): number =>
    value < min ? min : value > max ? max : value;
  const rawPage = body.page ?? 1;
  const rawLimit = body.limit ?? 20;
  const page = rawPage < 1 ? 1 : rawPage;
  const limit = clamp(rawLimit, 1, 100);
  const skip = (page - 1) * limit;

  // Sorting defaults and narrowing to allowed fields
  const sortField = body.sort === "created_at" ? "created_at" : "occurred_at";
  const direction = body.direction === "asc" ? "asc" : "desc";

  // Build where condition (include soft-delete guard)
  const hasDateFilter =
    (body.occurred_from !== undefined && body.occurred_from !== null) ||
    (body.occurred_to !== undefined && body.occurred_to !== null);

  const searchText =
    body.search !== undefined && body.search !== null ? body.search.trim() : "";

  const whereCondition = {
    todo_app_todo_id: todoId,
    deleted_at: null,
    ...(hasDateFilter
      ? {
          occurred_at: {
            ...(body.occurred_from !== undefined && body.occurred_from !== null
              ? { gte: body.occurred_from }
              : {}),
            ...(body.occurred_to !== undefined && body.occurred_to !== null
              ? { lte: body.occurred_to }
              : {}),
          },
        }
      : {}),
    ...(searchText.length > 0
      ? {
          reason: { contains: searchText },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_todo_deletion_events.findMany({
      where: whereCondition,
      orderBy:
        sortField === "occurred_at"
          ? { occurred_at: direction }
          : { created_at: direction },
      skip,
      take: limit,
      select: {
        id: true,
        occurred_at: true,
        reason: true,
      },
    }),
    MyGlobal.prisma.todo_app_todo_deletion_events.count({
      where: whereCondition,
    }),
  ]);

  const data = rows.map((row) => ({
    id: row.id,
    occurred_at: toISOStringSafe(row.occurred_at),
    reason: row.reason === null ? undefined : row.reason,
  }));

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: Number(total),
      pages: Number(Math.ceil(total / limit)),
    },
    data,
  };
}
