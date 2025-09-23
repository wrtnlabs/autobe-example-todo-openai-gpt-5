import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppTodoActivity } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoActivity";
import { IPageITodoAppTodoActivity } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppTodoActivity";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

/**
 * List Todo activity history from todo_app_todo_activities for a specific Todo
 *
 * Retrieves a filtered, paginated list of activity records for the Todo
 * identified by `todoId`. Applies strict ownership verification (only the Todo
 * owner may access). Supports filtering by activity types, occurred_at range,
 * and free-text search over details/changed_fields, with pagination and
 * sorting.
 *
 * Authorization: Only the owning todoUser (via todo_app_todos.todo_app_user_id)
 * may access. If the Todo is not found or not owned by the caller, a 404 is
 * returned to avoid information leakage.
 *
 * @param props - Request properties
 * @param props.todoUser - Authenticated Todo user payload
 * @param props.todoId - UUID of the Todo to list activities for
 * @param props.body - Pagination, sorting, and filtering criteria
 * @returns Paginated activity summaries for the requested Todo
 * @throws {HttpException} 400 When pagination parameters are out of bounds
 * @throws {HttpException} 404 When the Todo does not exist or is not owned by
 *   the caller
 */
export async function patchtodoAppTodoUserTodosTodoIdActivities(props: {
  todoUser: TodouserPayload;
  todoId: string & tags.Format<"uuid">;
  body: ITodoAppTodoActivity.IRequest;
}): Promise<IPageITodoAppTodoActivity.ISummary> {
  const { todoUser, todoId, body } = props;

  // Validate pagination bounds when provided
  const requestedPage = body.page ?? null;
  if (requestedPage !== null && requestedPage < 1) {
    throw new HttpException("Bad Request: 'page' must be >= 1", 400);
  }
  const requestedLimit = body.limit ?? null;
  if (requestedLimit !== null && (requestedLimit < 1 || requestedLimit > 100)) {
    throw new HttpException(
      "Bad Request: 'limit' must be between 1 and 100",
      400,
    );
  }

  // Defaults
  const page = body.page ?? 1;
  const limit = body.limit ?? 20;
  const sortKey = body.sort ?? "occurred_at"; // "occurred_at" | "created_at"
  const sortDirection = body.direction ?? "desc"; // "asc" | "desc"
  const skip = (page - 1) * limit;

  // Ownership check: ensure Todo exists and is owned by caller (and not soft-deleted)
  const ownedTodo = await MyGlobal.prisma.todo_app_todos.findFirst({
    where: {
      id: todoId,
      todo_app_user_id: todoUser.id,
      deleted_at: null,
    },
    select: { id: true },
  });
  if (!ownedTodo) {
    throw new HttpException("Not Found", 404);
  }

  // Normalize search term
  const normalizedSearch = ((): string | null => {
    if (body.search === undefined || body.search === null) return null;
    const t = body.search.trim();
    return t.length > 0 ? t : null;
  })();

  // Build where condition for activities (soft-deleted excluded)
  const whereCondition = {
    todo_app_todo_id: todoId,
    deleted_at: null,
    ...(body.activity_types !== undefined &&
      body.activity_types !== null &&
      body.activity_types.length > 0 && {
        activity_type: { in: body.activity_types },
      }),
    ...((body.occurred_from !== undefined && body.occurred_from !== null) ||
    (body.occurred_to !== undefined && body.occurred_to !== null)
      ? {
          occurred_at: {
            ...(body.occurred_from !== undefined &&
              body.occurred_from !== null && { gte: body.occurred_from }),
            ...(body.occurred_to !== undefined &&
              body.occurred_to !== null && { lte: body.occurred_to }),
          },
        }
      : {}),
    ...(normalizedSearch !== null
      ? {
          OR: [
            { details: { contains: normalizedSearch } },
            { changed_fields: { contains: normalizedSearch } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_todo_activities.findMany({
      where: whereCondition,
      select: {
        id: true,
        activity_type: true,
        occurred_at: true,
        details: true,
      },
      orderBy:
        sortKey === "occurred_at"
          ? { occurred_at: sortDirection }
          : { created_at: sortDirection },
      skip: skip,
      take: limit,
    }),
    MyGlobal.prisma.todo_app_todo_activities.count({ where: whereCondition }),
  ]);

  const data = rows.map((row) => ({
    id: typia.assert<string & tags.Format<"uuid">>(row.id),
    activity_type: row.activity_type,
    occurred_at: toISOStringSafe(row.occurred_at),
    details: row.details ?? null,
  }));

  const currentNum = Number(page);
  const limitNum = Number(limit);
  const recordsNum = Number(total);
  const pagesNum = limitNum > 0 ? Math.ceil(recordsNum / limitNum) : 0;

  return {
    pagination: {
      current: currentNum,
      limit: limitNum,
      records: recordsNum,
      pages: pagesNum,
    },
    data,
  };
}
