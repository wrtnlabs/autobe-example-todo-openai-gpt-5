import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppDataExport } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppDataExport";
import { IPageITodoAppDataExport } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppDataExport";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

export async function patchtodoAppTodoUserUsersUserIdDataExports(props: {
  todoUser: TodouserPayload;
  userId: string & tags.Format<"uuid">;
  body: ITodoAppDataExport.IRequest;
}): Promise<IPageITodoAppDataExport.ISummary> {
  /**
   * List/search data exports (todo_app_data_exports) for a user
   *
   * Returns a paginated list of personal data export jobs owned by the
   * specified user. Supports pagination, filtering (status, created/completed
   * time windows, export_format, free-text over status_message), and sorting by
   * created_at, completed_at, or expires_at. Soft-deleted records are
   * excluded.
   *
   * Authorization: Only the owner (todoUser) can access their own data exports.
   * When the authenticated principal does not match the path userId, the
   * request is denied.
   *
   * @param props - Request properties
   * @param props.todoUser - Authenticated todoUser payload (owner)
   * @param props.userId - Owner user’s ID (UUID) to scope data export jobs
   * @param props.body - Filtering, sorting, and pagination criteria
   * @returns Paginated list of data export summaries for the user
   * @throws {HttpException} 403 when accessing another user's exports
   * @throws {HttpException} 400 for invalid pagination inputs
   */
  const { todoUser, userId, body } = props;

  // Authorization: owner-only access
  if (!todoUser || todoUser.id !== userId) {
    throw new HttpException(
      "Forbidden: You can only access your own data exports",
      403,
    );
  }

  // Pagination defaults and validation (page: 1-based, limit: 1..100)
  const pageInput = body.page ?? 1;
  const limitInput = body.limit ?? 20;
  const page = Number(pageInput);
  const limit = Number(limitInput);

  if (!Number.isFinite(page) || page < 1) {
    throw new HttpException("Bad Request: Invalid page", 400);
  }
  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    throw new HttpException("Bad Request: Invalid limit", 400);
  }
  const skip = (page - 1) * limit;

  // Sorting: whitelist order_by and order_dir
  const allowedOrderBy = ["created_at", "completed_at", "expires_at"] as const;
  const rawOrderBy = body.order_by ?? "created_at";
  const orderBy: "created_at" | "completed_at" | "expires_at" =
    allowedOrderBy.includes(rawOrderBy as any)
      ? (rawOrderBy as "created_at" | "completed_at" | "expires_at")
      : "created_at";
  const orderDir: "asc" | "desc" = body.order_dir === "asc" ? "asc" : "desc";

  // Build where condition (exclude soft-deleted)
  const whereCondition = {
    todo_app_user_id: userId,
    deleted_at: null,
    ...(body.status !== undefined &&
      body.status !== null && {
        status: body.status,
      }),
    ...(body.export_format !== undefined &&
      body.export_format !== null && {
        export_format: body.export_format,
      }),
    ...(body.q !== undefined &&
      body.q !== null &&
      body.q.trim().length > 0 && {
        status_message: { contains: body.q.trim() },
      }),
    // created_at range
    ...(() => {
      const from = body.from_created_at ?? null;
      const to = body.to_created_at ?? null;
      if (from === null && to === null) return {};
      return {
        created_at: {
          ...(from !== null && { gte: from }),
          ...(to !== null && { lte: to }),
        },
      };
    })(),
    // completed_at range
    ...(() => {
      const from = body.from_completed_at ?? null;
      const to = body.to_completed_at ?? null;
      if (from === null && to === null) return {};
      return {
        completed_at: {
          ...(from !== null && { gte: from }),
          ...(to !== null && { lte: to }),
        },
      };
    })(),
  };

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_data_exports.findMany({
      where: whereCondition,
      orderBy:
        orderBy === "created_at"
          ? { created_at: orderDir }
          : orderBy === "completed_at"
            ? { completed_at: orderDir }
            : { expires_at: orderDir },
      skip: skip,
      take: limit,
      select: {
        id: true,
        status: true,
        export_format: true,
        completed_at: true,
        expires_at: true,
      },
    }),
    MyGlobal.prisma.todo_app_data_exports.count({ where: whereCondition }),
  ]);

  const data = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    status: r.status,
    export_format:
      r.export_format as ITodoAppDataExport.ISummary["export_format"],
    completed_at: r.completed_at ? toISOStringSafe(r.completed_at) : null,
    expires_at: r.expires_at ? toISOStringSafe(r.expires_at) : null,
  }));

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: Number(total),
      pages: Math.ceil(total / limit),
    },
    data,
  };
}
