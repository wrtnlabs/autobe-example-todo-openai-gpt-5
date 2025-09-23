import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppUserRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserRateCounter";
import { IPageITodoAppUserRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppUserRateCounter";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Search user rate counters (todo_app_user_rate_counters)
 *
 * Reads paginated user-scoped rate counter windows across all users and
 * policies. Supports filtering by policy, user, window ranges, and
 * currently-blocked state. Results exclude soft-deleted rows by default
 * (deleted_at IS NULL). Requires systemAdmin authorization.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator payload
 * @param props.body - Search, filter, sort, and pagination criteria
 * @returns Paginated list of user rate counters
 * @throws {HttpException} 403 when the caller lacks systemAdmin membership
 */
export async function patchtodoAppSystemAdminUserRateCounters(props: {
  systemAdmin: SystemadminPayload;
  body: ITodoAppUserRateCounter.IRequest;
}): Promise<IPageITodoAppUserRateCounter> {
  const { systemAdmin, body } = props;

  // Authorization: verify active systemAdmin membership and owning user state
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
    select: { id: true },
  });
  if (!membership) throw new HttpException("Forbidden", 403);

  // Pagination defaults
  const page = Number(body.page ?? 1);
  const limit = Number(body.limit ?? 20);
  const skip = (page - 1) * limit;

  // Build where condition (exclude soft-deleted)
  const nowIso = toISOStringSafe(new Date());
  const whereCondition = {
    deleted_at: null,
    ...(body.todo_app_rate_limit_id !== undefined &&
      body.todo_app_rate_limit_id !== null && {
        todo_app_rate_limit_id: body.todo_app_rate_limit_id,
      }),
    ...(body.todo_app_user_id !== undefined &&
      body.todo_app_user_id !== null && {
        todo_app_user_id: body.todo_app_user_id,
      }),
    ...(body.blocked_only ? { blocked_until: { gt: nowIso } } : {}),
    ...(() => {
      const from = body.window_started_from;
      const to = body.window_started_to;
      if (
        (from === undefined || from === null) &&
        (to === undefined || to === null)
      )
        return {};
      return {
        window_started_at: {
          ...(from !== undefined && from !== null && { gte: from }),
          ...(to !== undefined && to !== null && { lte: to }),
        },
      };
    })(),
    ...(() => {
      const from = body.window_ends_from;
      const to = body.window_ends_to;
      if (
        (from === undefined || from === null) &&
        (to === undefined || to === null)
      )
        return {};
      return {
        window_ends_at: {
          ...(from !== undefined && from !== null && { gte: from }),
          ...(to !== undefined && to !== null && { lte: to }),
        },
      };
    })(),
  };

  // Determine ordering (inline for Prisma type inference)
  const orderKey = body.order_by ?? "window_started_at";
  const orderDir = body.order_dir ?? "desc"; // "asc" | "desc"
  const orderBy = (() => {
    switch (orderKey) {
      case "window_started_at":
        return { window_started_at: orderDir };
      case "window_ends_at":
        return { window_ends_at: orderDir };
      case "last_action_at":
        return { last_action_at: orderDir };
      case "blocked_until":
        return { blocked_until: orderDir };
      case "created_at":
        return { created_at: orderDir };
      case "updated_at":
        return { updated_at: orderDir };
      case "count":
        return { count: orderDir };
      default:
        return { window_started_at: "desc" };
    }
  })();

  // Query data and total count in parallel
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_user_rate_counters.findMany({
      where: whereCondition,
      orderBy: orderBy,
      skip,
      take: limit,
      select: {
        id: true,
        todo_app_rate_limit_id: true,
        todo_app_user_id: true,
        window_started_at: true,
        window_ends_at: true,
        count: true,
        last_action_at: true,
        blocked_until: true,
        created_at: true,
        updated_at: true,
        deleted_at: true,
      },
    }),
    MyGlobal.prisma.todo_app_user_rate_counters.count({
      where: whereCondition,
    }),
  ]);

  // Map to DTOs with precise date conversions and runtime validation/branding
  const data = rows.map((r) =>
    typia.assert<ITodoAppUserRateCounter>({
      id: r.id,
      todo_app_rate_limit_id: r.todo_app_rate_limit_id,
      todo_app_user_id: r.todo_app_user_id,
      window_started_at: toISOStringSafe(r.window_started_at),
      window_ends_at: toISOStringSafe(r.window_ends_at),
      count: Number(r.count),
      last_action_at: r.last_action_at
        ? toISOStringSafe(r.last_action_at)
        : null,
      blocked_until: r.blocked_until ? toISOStringSafe(r.blocked_until) : null,
      created_at: toISOStringSafe(r.created_at),
      updated_at: toISOStringSafe(r.updated_at),
      deleted_at: r.deleted_at ? toISOStringSafe(r.deleted_at) : null,
    }),
  );

  const records = Number(total);
  const pages = Number(limit > 0 ? Math.ceil(records / limit) : 0);

  return typia.assert<IPageITodoAppUserRateCounter>({
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records,
      pages,
    },
    data,
  });
}
