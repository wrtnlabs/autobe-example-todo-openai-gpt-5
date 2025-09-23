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
 * Search user rate counters by policy (todo_app_user_rate_counters)
 *
 * Returns paginated user rate counter windows scoped to the given rateLimitId.
 * Applies optional filters (user, window ranges, blocked state) and sorting.
 * Excludes soft-deleted records by default.
 *
 * Security: System admin only. Verifies active, non-revoked system admin
 * membership and owning user state before listing.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator payload
 * @param props.rateLimitId - UUID of the rate limit policy to scope counters
 * @param props.body - Filtering, sorting, and pagination options
 * @returns Paginated list of user rate counters for the given policy
 * @throws {HttpException} 400 when rateLimitId is not a valid UUID or
 *   pagination invalid
 * @throws {HttpException} 401/403 when unauthorized to access
 */
export async function patchtodoAppSystemAdminRateLimitsRateLimitIdUserRateCounters(props: {
  systemAdmin: SystemadminPayload;
  rateLimitId: string & tags.Format<"uuid">;
  body: ITodoAppUserRateCounter.IRequest;
}): Promise<IPageITodoAppUserRateCounter> {
  const { systemAdmin, rateLimitId, body } = props;

  // Validate path UUID format explicitly (runtime)
  if (!typia.is<string & tags.Format<"uuid">>(rateLimitId)) {
    throw new HttpException("Bad Request: Invalid rateLimitId format", 400);
  }

  // Authorization: ensure requester is an active, non-revoked system admin
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
    throw new HttpException(
      "Forbidden: administrator privileges required",
      403,
    );
  }

  // Pagination & sorting
  const pageVal = body.page ?? 1;
  const limitVal = body.limit ?? 20;
  const pageNum = Number(pageVal);
  const limitNum = Number(limitVal);
  if (!Number.isFinite(pageNum) || pageNum < 1) {
    throw new HttpException("Bad Request: page must be >= 1", 400);
  }
  if (!Number.isFinite(limitNum) || limitNum < 1 || limitNum > 100) {
    throw new HttpException(
      "Bad Request: limit must be between 1 and 100",
      400,
    );
  }
  const skip = (pageNum - 1) * limitNum;

  const allowedSort: Array<
    | "window_started_at"
    | "window_ends_at"
    | "last_action_at"
    | "blocked_until"
    | "created_at"
    | "updated_at"
    | "count"
  > = [
    "window_started_at",
    "window_ends_at",
    "last_action_at",
    "blocked_until",
    "created_at",
    "updated_at",
    "count",
  ];
  const sortKey = (
    body.order_by && allowedSort.includes(body.order_by)
      ? body.order_by
      : "window_started_at"
  ) as
    | "window_started_at"
    | "window_ends_at"
    | "last_action_at"
    | "blocked_until"
    | "created_at"
    | "updated_at"
    | "count";
  let sortDir: "asc" | "desc" = "desc";
  if (body.order_dir === "asc") sortDir = "asc";
  else if (body.order_dir === "desc") sortDir = "desc";

  // Filters
  const nowIso = toISOStringSafe(new Date());
  const whereCondition = {
    deleted_at: null,
    todo_app_rate_limit_id: rateLimitId,
    ...(body.todo_app_user_id !== undefined &&
      body.todo_app_user_id !== null && {
        todo_app_user_id: body.todo_app_user_id,
      }),
    ...((body.window_started_from !== undefined &&
      body.window_started_from !== null) ||
    (body.window_started_to !== undefined && body.window_started_to !== null)
      ? {
          window_started_at: {
            ...(body.window_started_from !== undefined &&
              body.window_started_from !== null && {
                gte: body.window_started_from,
              }),
            ...(body.window_started_to !== undefined &&
              body.window_started_to !== null && {
                lte: body.window_started_to,
              }),
          },
        }
      : {}),
    ...((body.window_ends_from !== undefined &&
      body.window_ends_from !== null) ||
    (body.window_ends_to !== undefined && body.window_ends_to !== null)
      ? {
          window_ends_at: {
            ...(body.window_ends_from !== undefined &&
              body.window_ends_from !== null && {
                gte: body.window_ends_from,
              }),
            ...(body.window_ends_to !== undefined &&
              body.window_ends_to !== null && {
                lte: body.window_ends_to,
              }),
          },
        }
      : {}),
    ...(body.blocked_only === true && {
      blocked_until: { gt: nowIso },
    }),
  };

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_user_rate_counters.findMany({
      where: whereCondition,
      orderBy: { [sortKey]: sortDir },
      skip: skip,
      take: limitNum,
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

  const data = rows.map((r) => {
    const item: ITodoAppUserRateCounter = {
      id: r.id as string & tags.Format<"uuid">,
      todo_app_rate_limit_id: r.todo_app_rate_limit_id as string &
        tags.Format<"uuid">,
      todo_app_user_id: r.todo_app_user_id as string & tags.Format<"uuid">,
      window_started_at: toISOStringSafe(r.window_started_at),
      window_ends_at: toISOStringSafe(r.window_ends_at),
      count: r.count as number & tags.Type<"int32">,
      last_action_at: r.last_action_at
        ? toISOStringSafe(r.last_action_at)
        : null,
      blocked_until: r.blocked_until ? toISOStringSafe(r.blocked_until) : null,
      created_at: toISOStringSafe(r.created_at),
      updated_at: toISOStringSafe(r.updated_at),
      // deleted_at is optional in DTO; omit when null
      deleted_at: r.deleted_at ? toISOStringSafe(r.deleted_at) : undefined,
    };
    return item;
  });

  return {
    pagination: {
      current: Number(pageNum),
      limit: Number(limitNum),
      records: Number(total),
      pages:
        Number(limitNum) === 0
          ? 0
          : Math.ceil(Number(total) / Number(limitNum)),
    },
    data,
  };
}
