import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppIpRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppIpRateCounter";
import { IPageITodoAppIpRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppIpRateCounter";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Search IP rate counters (todo_app_ip_rate_counters) with pagination and
 * filters.
 *
 * Retrieves a filtered, paginated list of IP-scoped rate counters. Supports
 * filtering by policy, IP text, window time range, and active block status,
 * with sortable fields. Soft-deleted rows (deleted_at != null) are excluded by
 * default.
 *
 * Authorization: system administrators only. Verifies active, non-revoked admin
 * role and owning user account state (active, verified, not deleted).
 *
 * @param props - Request properties
 * @param props.systemAdmin - Authenticated system admin payload
 * @param props.body - Search criteria, sorting, and pagination
 * @returns Paginated summaries of IP rate counter rows
 * @throws {HttpException} 401 When not authenticated as system admin
 * @throws {HttpException} 403 When admin role is not active/authorized
 */
export async function patchtodoAppSystemAdminIpRateCounters(props: {
  systemAdmin: SystemadminPayload;
  body: ITodoAppIpRateCounter.IRequest;
}): Promise<IPageITodoAppIpRateCounter.ISummary> {
  const { systemAdmin, body } = props;

  // Authorization: ensure current, active system admin membership
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
    throw new HttpException("Forbidden: system admin privileges required", 403);
  }

  // Pagination defaults and clamping
  const pageNum = Math.max(1, body.page ?? 1);
  const limitNum = Math.max(1, Math.min(100, body.limit ?? 20));
  const skip = (pageNum - 1) * limitNum;

  // Sort parsing (allow-listed)
  const rawSort = (body.sort ?? "").trim().toLowerCase();
  const parts = rawSort.split(/\s+/).filter((s) => s.length > 0);
  const sf = parts[0] ?? "window_started_at"; // sort field
  const sd = parts[1] === "asc" || parts[1] === "desc" ? parts[1] : "desc"; // direction
  const allowed: Record<string, true> = {
    last_action_at: true,
    window_started_at: true,
    window_ends_at: true,
    count: true,
    blocked_until: true,
    created_at: true,
    updated_at: true,
  };
  const sortField = allowed[sf] ? sf : "window_started_at";
  const sortDir = sd;

  // Build where condition once for findMany + count (allowed for complexity)
  const nowIso = toISOStringSafe(new Date());
  const whereCondition = {
    deleted_at: null,
    ...(body.todo_app_rate_limit_id !== undefined &&
      body.todo_app_rate_limit_id !== null && {
        todo_app_rate_limit_id: body.todo_app_rate_limit_id,
      }),
    ...(body.ip !== undefined &&
      body.ip !== null &&
      body.ip.length > 0 && {
        ip: { contains: body.ip },
      }),
    ...((body.window_from !== undefined && body.window_from !== null) ||
    (body.window_to !== undefined && body.window_to !== null)
      ? {
          // Date range over the counter window
          window_started_at:
            body.window_from !== undefined && body.window_from !== null
              ? { gte: body.window_from }
              : undefined,
          window_ends_at:
            body.window_to !== undefined && body.window_to !== null
              ? { lte: body.window_to }
              : undefined,
        }
      : {}),
    ...(body.blocked_only === true && {
      blocked_until: { gt: nowIso },
    }),
  };

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_ip_rate_counters.findMany({
      where: whereCondition,
      select: {
        id: true,
        todo_app_rate_limit_id: true,
        ip: true,
        window_started_at: true,
        window_ends_at: true,
        count: true,
        last_action_at: true,
        blocked_until: true,
      },
      orderBy:
        sortField === "last_action_at"
          ? { last_action_at: sortDir }
          : sortField === "window_started_at"
            ? { window_started_at: sortDir }
            : sortField === "window_ends_at"
              ? { window_ends_at: sortDir }
              : sortField === "count"
                ? { count: sortDir }
                : sortField === "blocked_until"
                  ? { blocked_until: sortDir }
                  : sortField === "created_at"
                    ? { created_at: sortDir }
                    : { updated_at: sortDir },
      skip,
      take: limitNum,
    }),
    MyGlobal.prisma.todo_app_ip_rate_counters.count({ where: whereCondition }),
  ]);

  return {
    pagination: {
      current: Number(pageNum),
      limit: Number(limitNum),
      records: Number(total),
      pages: Number(Math.ceil(total / limitNum)),
    },
    data: rows.map((r) => ({
      id: r.id as string & tags.Format<"uuid">,
      todo_app_rate_limit_id: r.todo_app_rate_limit_id as string &
        tags.Format<"uuid">,
      ip: r.ip,
      window_started_at: toISOStringSafe(r.window_started_at),
      window_ends_at: toISOStringSafe(r.window_ends_at),
      count: r.count as number & tags.Type<"int32">,
      last_action_at: r.last_action_at
        ? toISOStringSafe(r.last_action_at)
        : null,
      blocked_until: r.blocked_until ? toISOStringSafe(r.blocked_until) : null,
    })),
  };
}
