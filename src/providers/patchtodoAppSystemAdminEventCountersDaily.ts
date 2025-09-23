import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppEventCountersDaily } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEventCountersDaily";
import { IPageITodoAppEventCountersDaily } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppEventCountersDaily";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

export async function patchtodoAppSystemAdminEventCountersDaily(props: {
  systemAdmin: SystemadminPayload;
  body: ITodoAppEventCountersDaily.IRequest;
}): Promise<IPageITodoAppEventCountersDaily> {
  /**
   * Search list of daily event counters (todo_app_event_counters_daily) with
   * filters and pagination
   *
   * Retrieves paginated daily event counter snapshots for analytics, supporting
   * filters by event type, actor user, target todo, and bucket_date ranges,
   * with sorting. Access is restricted to system administrators. Read-only
   * operation.
   *
   * Authorization: Caller must be an active, verified system admin (not
   * revoked/deleted).
   *
   * @param props - Request properties
   * @param props.systemAdmin - Authenticated System Admin payload
   * @param props.body - Search, filter, sort, and pagination parameters
   * @returns Paginated collection of daily event counters
   * @throws {HttpException} 403 when caller is not a valid system admin
   * @throws {HttpException} 400 when date window is inverted or invalid
   */
  const { systemAdmin, body } = props;

  // Authorization check (system admin membership must be active)
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
  if (!membership) throw new HttpException("Forbidden", 403);

  // Defaults (page >=1, limit 1..100)
  const page = (body.page ?? 1) as number;
  const limit = (body.limit ?? 20) as number;
  const safePage = page < 1 ? 1 : page;
  const safeLimit = limit < 1 ? 1 : limit > 100 ? 100 : limit;

  // Date range validation and normalization
  const from = body.bucket_date_from ?? undefined;
  const to = body.bucket_date_to ?? undefined;
  if (from !== undefined && to !== undefined) {
    const fromTs = Date.parse(from);
    const toTs = Date.parse(to);
    if (Number.isNaN(fromTs) || Number.isNaN(toTs)) {
      throw new HttpException("Bad Request: Invalid date-time format", 400);
    }
    if (fromTs > toTs) {
      throw new HttpException(
        "Bad Request: bucket_date_from must be <= bucket_date_to",
        400,
      );
    }
  }

  // Build where condition (schema-verified fields only)
  const whereCondition = {
    ...(body.event_type_id !== undefined &&
      body.event_type_id !== null && {
        todo_app_event_type_id: body.event_type_id,
      }),
    ...(body.user_id !== undefined && { todo_app_user_id: body.user_id }),
    ...(body.todo_id !== undefined && { todo_app_todo_id: body.todo_id }),
    ...(from !== undefined || to !== undefined
      ? {
          bucket_date: {
            ...(from !== undefined && { gte: toISOStringSafe(from) }),
            ...(to !== undefined && { lte: toISOStringSafe(to) }),
          },
        }
      : {}),
  };

  const sortBy = body.sort_by ?? "bucket_date";
  const sortDir = body.sort_dir === "asc" ? "asc" : "desc";

  const skip = (safePage - 1) * safeLimit;
  const take = safeLimit;

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_event_counters_daily.findMany({
      where: whereCondition,
      select: {
        id: true,
        todo_app_event_type_id: true,
        todo_app_user_id: true,
        todo_app_todo_id: true,
        bucket_date: true,
        count: true,
        created_at: true,
        updated_at: true,
      },
      orderBy:
        sortBy === "count"
          ? { count: sortDir }
          : sortBy === "created_at"
            ? { created_at: sortDir }
            : sortBy === "updated_at"
              ? { updated_at: sortDir }
              : { bucket_date: sortDir },
      skip,
      take,
    }),
    MyGlobal.prisma.todo_app_event_counters_daily.count({
      where: whereCondition,
    }),
  ]);

  const data = rows.map((r) => ({
    id: r.id,
    todo_app_event_type_id: r.todo_app_event_type_id,
    todo_app_user_id: r.todo_app_user_id ?? null,
    todo_app_todo_id: r.todo_app_todo_id ?? null,
    bucket_date: toISOStringSafe(r.bucket_date),
    count: r.count as number,
    created_at: toISOStringSafe(r.created_at),
    updated_at: toISOStringSafe(r.updated_at),
  }));

  return {
    pagination: {
      current: Number(safePage),
      limit: Number(safeLimit),
      records: total,
      pages: Math.ceil(total / (take === 0 ? 1 : take)),
    },
    data,
  };
}
