import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppDailyStat } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppDailyStat";
import { IPageITodoAppDailyStat } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppDailyStat";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Search and paginate daily stats (mv_todo_app_daily_stats)
 *
 * Returns a paginated list of daily statistics from mv_todo_app_daily_stats.
 * Supports filtering by stats_date range, sorting, and pagination. Excludes
 * soft-deleted rows (deleted_at != null). Restricted to systemAdmin role.
 *
 * @param props - Request properties
 * @param props.systemAdmin - Authenticated System Admin payload
 * @param props.body - Search filters and pagination options
 * @returns Paginated list of daily statistics summaries
 * @throws {HttpException} 403 when the requester is not an active system admin
 * @throws {HttpException} 400 when inputs are invalid (page/limit bounds, date
 *   window)
 */
export async function patchtodoAppSystemAdminDailyStats(props: {
  systemAdmin: SystemadminPayload;
  body: ITodoAppDailyStat.IRequest;
}): Promise<IPageITodoAppDailyStat.ISummary> {
  const { systemAdmin, body } = props;

  // Authorization: ensure requester is an active system admin and owning user is active/verified
  const membership = await MyGlobal.prisma.todo_app_systemadmins.findFirst({
    where: {
      todo_app_user_id: systemAdmin.id,
      revoked_at: null,
      deleted_at: null,
      user: {
        deleted_at: null,
        status: "active",
        email_verified: true,
      },
    },
  });
  if (membership === null) {
    throw new HttpException("Forbidden: systemAdmin membership required", 403);
  }

  // Resolve pagination with defaults and validate
  const page = body.page ?? 1;
  const limit = body.limit ?? 20;
  if (typeof page !== "number" || page < 1) {
    throw new HttpException("Bad Request: page must be >= 1", 400);
  }
  if (typeof limit !== "number" || limit < 1 || limit > 100) {
    throw new HttpException(
      "Bad Request: limit must be between 1 and 100",
      400,
    );
  }

  // Normalize and validate date window
  const fromIso = body.stats_date_from
    ? toISOStringSafe(body.stats_date_from)
    : null;
  const toIso = body.stats_date_to ? toISOStringSafe(body.stats_date_to) : null;
  if (fromIso !== null && toIso !== null && fromIso > toIso) {
    throw new HttpException(
      "Bad Request: stats_date_from must be <= stats_date_to",
      400,
    );
  }

  // Build where condition (allowed exception as per guidelines)
  const whereCondition = {
    deleted_at: null,
    ...(fromIso !== null || toIso !== null
      ? {
          stats_date: {
            ...(fromIso !== null ? { gte: fromIso } : {}),
            ...(toIso !== null ? { lte: toIso } : {}),
          },
        }
      : {}),
  };

  // Parse sort with whitelist and default
  type SortField =
    | "stats_date"
    | "todos_created"
    | "todos_completed"
    | "active_users"
    | "completion_ratio"
    | "refreshed_at";
  let sortField: SortField = "stats_date";
  let sortOrder: "asc" | "desc" = "desc";
  if (body.sort && typeof body.sort === "string") {
    const tokens = body.sort.trim().split(/\s+/);
    const field = tokens[0] as string;
    const dir = (tokens[1] || "").toLowerCase();
    const allowed: SortField[] = [
      "stats_date",
      "todos_created",
      "todos_completed",
      "active_users",
      "completion_ratio",
      "refreshed_at",
    ];
    if (allowed.includes(field as SortField)) {
      sortField = field as SortField;
    }
    if (dir === "asc" || dir === "desc") {
      sortOrder = dir;
    }
  }

  const skip = (Number(page) - 1) * Number(limit);
  const take = Number(limit);

  // Execute queries in parallel
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.mv_todo_app_daily_stats.findMany({
      where: whereCondition,
      select: {
        id: true,
        stats_date: true,
        todos_created: true,
        todos_completed: true,
        active_users: true,
        completion_ratio: true,
      },
      orderBy:
        sortField === "stats_date"
          ? { stats_date: sortOrder }
          : sortField === "todos_created"
            ? { todos_created: sortOrder }
            : sortField === "todos_completed"
              ? { todos_completed: sortOrder }
              : sortField === "active_users"
                ? { active_users: sortOrder }
                : sortField === "completion_ratio"
                  ? { completion_ratio: sortOrder }
                  : { refreshed_at: sortOrder },
      skip,
      take,
    }),
    MyGlobal.prisma.mv_todo_app_daily_stats.count({
      where: whereCondition,
    }),
  ]);

  // Map to DTO
  const data = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    stats_date: toISOStringSafe(r.stats_date),
    todos_created: Number(r.todos_created),
    todos_completed: Number(r.todos_completed),
    active_users: Number(r.active_users),
    completion_ratio: Number(r.completion_ratio),
  }));

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: Number(total),
      pages: Number(Math.ceil(Number(total) / Number(limit))),
    },
    data,
  };
}
