import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppKpiCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppKpiCounter";
import { IPageITodoAppKpiCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppKpiCounter";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

export async function patchtodoAppSystemAdminKpiCounters(props: {
  systemAdmin: SystemadminPayload;
  body: ITodoAppKpiCounter.IRequest;
}): Promise<IPageITodoAppKpiCounter> {
  const { systemAdmin, body } = props;

  // Authorization: ensure caller is an active system admin
  if (!systemAdmin || !systemAdmin.id) {
    throw new HttpException("Unauthorized", 401);
  }
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
    throw new HttpException("Forbidden", 403);
  }

  // Pagination defaults and validation
  const page = body.page ?? 1;
  const limit = body.limit ?? 20;
  if (page < 1) {
    throw new HttpException("Bad Request: page must be >= 1", 400);
  }
  if (limit < 1 || limit > 100) {
    throw new HttpException(
      "Bad Request: limit must be between 1 and 100",
      400,
    );
  }
  const skip = (page - 1) * limit;

  // Validate window ranges if both bounds provided
  const wsFrom = body.window_start_from ?? undefined;
  const wsTo = body.window_start_to ?? undefined;
  const weFrom = body.window_end_from ?? undefined;
  const weTo = body.window_end_to ?? undefined;

  if (wsFrom !== undefined && wsTo !== undefined && wsFrom > wsTo) {
    throw new HttpException(
      "Bad Request: window_start range is invalid (from > to)",
      400,
    );
  }
  if (weFrom !== undefined && weTo !== undefined && weFrom > weTo) {
    throw new HttpException(
      "Bad Request: window_end range is invalid (from > to)",
      400,
    );
  }

  // Build where condition
  const whereCondition = {
    deleted_at: null,
    ...(wsFrom !== undefined || wsTo !== undefined
      ? {
          window_start: {
            ...(wsFrom !== undefined && { gte: toISOStringSafe(wsFrom) }),
            ...(wsTo !== undefined && { lte: toISOStringSafe(wsTo) }),
          },
        }
      : {}),
    ...(weFrom !== undefined || weTo !== undefined
      ? {
          window_end: {
            ...(weFrom !== undefined && { gte: toISOStringSafe(weFrom) }),
            ...(weTo !== undefined && { lte: toISOStringSafe(weTo) }),
          },
        }
      : {}),
  };

  // Determine ordering (default: window_end desc)
  const orderBy = (() => {
    const dir = body.order_dir === "asc" ? "asc" : ("desc" as const);
    const key = body.order_by ?? "window_end";
    if (key === "window_start") return { window_start: dir } as const;
    if (key === "created_at") return { created_at: dir } as const;
    if (key === "updated_at") return { updated_at: dir } as const;
    return { window_end: dir } as const;
  })();

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.mv_todo_app_kpi_counters.findMany({
      where: whereCondition,
      select: {
        id: true,
        window_start: true,
        window_end: true,
        todos_created: true,
        todos_completed: true,
        active_users: true,
        avg_time_to_complete_hours: true,
        p95_completion_time_hours: true,
        refreshed_at: true,
        created_at: true,
        updated_at: true,
        deleted_at: true,
      },
      orderBy: orderBy,
      skip: skip,
      take: limit,
    }),
    MyGlobal.prisma.mv_todo_app_kpi_counters.count({ where: whereCondition }),
  ]);

  const data = rows.map((r) => ({
    id: r.id,
    window_start: toISOStringSafe(r.window_start),
    window_end: toISOStringSafe(r.window_end),
    todos_created: r.todos_created,
    todos_completed: r.todos_completed,
    active_users: r.active_users,
    avg_time_to_complete_hours: r.avg_time_to_complete_hours ?? null,
    p95_completion_time_hours: r.p95_completion_time_hours ?? null,
    refreshed_at: toISOStringSafe(r.refreshed_at),
    created_at: toISOStringSafe(r.created_at),
    updated_at: toISOStringSafe(r.updated_at),
    deleted_at: r.deleted_at ? toISOStringSafe(r.deleted_at) : null,
  }));

  const pages = total === 0 ? 0 : Math.ceil(total / limit);
  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: Number(total),
      pages: Number(pages),
    },
    data,
  };
}
