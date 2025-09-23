import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppAggregatedMetric } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAggregatedMetric";
import { IPageITodoAppAggregatedMetric } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppAggregatedMetric";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Search and paginate aggregated metrics (todo_app_aggregated_metrics)
 *
 * Retrieves a filtered, paginated list of aggregated metric snapshots for
 * system administrators. Supports filtering by metric_key, granularity, time
 * windows (period_start/period_end), and optional dimensions (todo_app_user_id,
 * todo_app_event_type_id), with sorting and pagination. Excludes soft-deleted
 * rows by default.
 *
 * Authorization: systemAdmin only. Verifies active admin membership before
 * querying.
 *
 * @param props - Request properties
 * @param props.systemAdmin - Authenticated System Admin payload
 * @param props.body - Search, filter, sort, and pagination parameters
 * @returns Paginated list of aggregated metric summaries
 * @throws {HttpException} 401/403 when unauthorized or not an active admin
 * @throws {HttpException} 400 when validation fails (pagination bounds, invalid
 *   temporal windows, sort key)
 */
export async function patchtodoAppSystemAdminAggregatedMetrics(props: {
  systemAdmin: SystemadminPayload;
  body: ITodoAppAggregatedMetric.IRequest;
}): Promise<IPageITodoAppAggregatedMetric.ISummary> {
  const { systemAdmin, body } = props;

  // ----- Authorization: must be system admin and active membership -----
  if (!systemAdmin || systemAdmin.type !== "systemadmin")
    throw new HttpException("Unauthorized", 401);

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
  if (membership === null)
    throw new HttpException(
      "Forbidden: not an active system administrator",
      403,
    );

  // ----- Defaults and validations -----
  const page = Number(body.page ?? 1);
  const limit = Number(body.limit ?? 20);
  if (page < 1 || limit < 1 || limit > 100)
    throw new HttpException("Bad Request: pagination out of bounds", 400);

  if (
    body.period_start_from !== undefined &&
    body.period_start_from !== null &&
    body.period_start_to !== undefined &&
    body.period_start_to !== null &&
    body.period_start_from > body.period_start_to
  ) {
    throw new HttpException(
      "Bad Request: period_start_from must be <= period_start_to",
      400,
    );
  }
  if (
    body.period_end_from !== undefined &&
    body.period_end_from !== null &&
    body.period_end_to !== undefined &&
    body.period_end_to !== null &&
    body.period_end_from > body.period_end_to
  ) {
    throw new HttpException(
      "Bad Request: period_end_from must be <= period_end_to",
      400,
    );
  }

  // Parse sort: allowed fields
  const allowedSortFields = new Set([
    "period_start",
    "period_end",
    "created_at",
  ]);
  let orderField: "period_start" | "period_end" | "created_at" = "created_at";
  let orderDirection: "asc" | "desc" = "desc";
  if (
    body.sort !== undefined &&
    body.sort !== null &&
    body.sort.trim().length > 0
  ) {
    const parts = body.sort.trim().split(/\s+/);
    const field = parts[0] as string;
    const dir = (parts[1]?.toLowerCase() ?? "desc") as string;
    if (!allowedSortFields.has(field))
      throw new HttpException("Bad Request: unsupported sort field", 400);
    orderField = field as typeof orderField;
    orderDirection = dir === "asc" ? "asc" : dir === "desc" ? "desc" : "desc";
  }

  // ----- Build where condition (shared) -----
  const where = {
    deleted_at: null,
    ...(body.metric_key !== undefined &&
      body.metric_key !== null && {
        metric_key: { contains: body.metric_key },
      }),
    ...(body.granularity !== undefined &&
      body.granularity !== null && {
        granularity: body.granularity,
      }),
    ...(body.todo_app_user_id !== undefined &&
      body.todo_app_user_id !== null && {
        todo_app_user_id: body.todo_app_user_id,
      }),
    ...(body.todo_app_event_type_id !== undefined &&
      body.todo_app_event_type_id !== null && {
        todo_app_event_type_id: body.todo_app_event_type_id,
      }),
    ...((body.period_start_from !== undefined &&
      body.period_start_from !== null) ||
    (body.period_start_to !== undefined && body.period_start_to !== null)
      ? {
          period_start: {
            ...(body.period_start_from !== undefined &&
              body.period_start_from !== null && {
                gte: body.period_start_from,
              }),
            ...(body.period_start_to !== undefined &&
              body.period_start_to !== null && {
                lte: body.period_start_to,
              }),
          },
        }
      : {}),
    ...((body.period_end_from !== undefined && body.period_end_from !== null) ||
    (body.period_end_to !== undefined && body.period_end_to !== null)
      ? {
          period_end: {
            ...(body.period_end_from !== undefined &&
              body.period_end_from !== null && {
                gte: body.period_end_from,
              }),
            ...(body.period_end_to !== undefined &&
              body.period_end_to !== null && {
                lte: body.period_end_to,
              }),
          },
        }
      : {}),
  };

  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_aggregated_metrics.findMany({
      where,
      orderBy: { [orderField]: orderDirection },
      skip,
      take: limit,
      select: {
        id: true,
        metric_key: true,
        granularity: true,
        period_start: true,
        period_end: true,
        value: true,
        unit: true,
        todo_app_user_id: true,
        todo_app_event_type_id: true,
        created_at: true,
      },
    }),
    MyGlobal.prisma.todo_app_aggregated_metrics.count({ where }),
  ]);

  const data = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    metric_key: r.metric_key,
    granularity: r.granularity,
    period_start: toISOStringSafe(r.period_start),
    period_end: toISOStringSafe(r.period_end),
    value: Number(r.value),
    unit: r.unit,
    todo_app_user_id:
      r.todo_app_user_id === null
        ? null
        : (r.todo_app_user_id as string & tags.Format<"uuid">),
    todo_app_event_type_id:
      r.todo_app_event_type_id === null
        ? null
        : (r.todo_app_event_type_id as string & tags.Format<"uuid">),
    created_at: toISOStringSafe(r.created_at),
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
