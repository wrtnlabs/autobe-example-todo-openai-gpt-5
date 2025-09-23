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

export async function patchtodoAppTodoUserDataExports(props: {
  todoUser: TodouserPayload;
  body: ITodoAppDataExport.IRequest;
}): Promise<IPageITodoAppDataExport.ISummary> {
  /**
   * List/search personal data export jobs (todo_app_data_exports) for the
   * authenticated user.
   *
   * Returns a filtered and paginated list of export job summaries belonging to
   * the caller. Filters: status, export_format, created_at range, completed_at
   * range, free-text q (status_message contains). Sorting:
   * created_at|completed_at|expires_at (default created_at desc). Pagination:
   * uses request values or falls back to user preference page_size, then
   * default 20. Excludes soft-deleted records (deleted_at is null) and enforces
   * ownership by todo_app_user_id.
   *
   * @param props - Request properties
   * @param props.todoUser - The authenticated todo user making the request
   * @param props.body - Search, filter, sort, and pagination parameters
   * @returns Paginated list of data export job summaries
   * @throws {HttpException} 401 when authentication is missing
   */
  const { todoUser, body } = props;
  if (!todoUser) throw new HttpException("Unauthorized", 401);

  // Resolve pagination defaults: page (>=1), limit (1..100)
  const pref = await MyGlobal.prisma.todo_app_user_preferences.findFirst({
    where: {
      todo_app_user_id: todoUser.id,
      deleted_at: null,
    },
    select: { page_size: true },
  });

  const pageFromBody = body.page ?? null;
  const limitFromBody = body.limit ?? null;

  const pageRaw =
    pageFromBody !== null && pageFromBody !== undefined
      ? Number(pageFromBody)
      : 1;
  const limitDefault = pref?.page_size ?? 20;
  const limitRaw =
    limitFromBody !== null && limitFromBody !== undefined
      ? Number(limitFromBody)
      : limitDefault;

  const page = pageRaw >= 1 ? pageRaw : 1;
  const limitClamped = limitRaw < 1 ? 1 : limitRaw > 100 ? 100 : limitRaw;
  const skip = (page - 1) * limitClamped;

  // Prepare filters
  const q = (body.q ?? "").trim();
  const hasQ = q.length > 0;

  const whereCondition = {
    deleted_at: null,
    todo_app_user_id: todoUser.id,
    ...(body.status !== undefined &&
      body.status !== null && { status: body.status }),
    ...(body.export_format !== undefined &&
      body.export_format !== null && {
        export_format: body.export_format,
      }),
    ...(hasQ && {
      status_message: { contains: q },
    }),
    // created_at range
    ...((body.from_created_at !== undefined && body.from_created_at !== null) ||
    (body.to_created_at !== undefined && body.to_created_at !== null)
      ? {
          created_at: {
            ...(body.from_created_at !== undefined &&
              body.from_created_at !== null && {
                gte: body.from_created_at,
              }),
            ...(body.to_created_at !== undefined &&
              body.to_created_at !== null && {
                lte: body.to_created_at,
              }),
          },
        }
      : {}),
    // completed_at range
    ...((body.from_completed_at !== undefined &&
      body.from_completed_at !== null) ||
    (body.to_completed_at !== undefined && body.to_completed_at !== null)
      ? {
          completed_at: {
            ...(body.from_completed_at !== undefined &&
              body.from_completed_at !== null && {
                gte: body.from_completed_at,
              }),
            ...(body.to_completed_at !== undefined &&
              body.to_completed_at !== null && {
                lte: body.to_completed_at,
              }),
          },
        }
      : {}),
  };

  // Sorting
  const sortKeyInput = (body.order_by ?? "created_at").toString();
  const sortKey =
    sortKeyInput === "completed_at" || sortKeyInput === "expires_at"
      ? sortKeyInput
      : "created_at";
  const dir: "asc" | "desc" =
    (body.order_dir ?? "desc") === "asc" ? "asc" : "desc";

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_data_exports.findMany({
      where: whereCondition,
      select: {
        id: true,
        status: true,
        export_format: true,
        completed_at: true,
        expires_at: true,
      },
      orderBy:
        sortKey === "created_at"
          ? { created_at: dir }
          : sortKey === "completed_at"
            ? { completed_at: dir }
            : { expires_at: dir },
      skip,
      take: limitClamped,
    }),
    MyGlobal.prisma.todo_app_data_exports.count({ where: whereCondition }),
  ]);

  const data = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    status: r.status,
    export_format: r.export_format as ETodoAppDataExportFormat,
    completed_at: r.completed_at ? toISOStringSafe(r.completed_at) : null,
    expires_at: r.expires_at ? toISOStringSafe(r.expires_at) : null,
  }));

  const pages = limitClamped > 0 ? Math.ceil(total / limitClamped) : 0;

  return {
    pagination: {
      current: Number(page),
      limit: Number(limitClamped),
      records: Number(total),
      pages: Number(pages),
    },
    data,
  };
}
