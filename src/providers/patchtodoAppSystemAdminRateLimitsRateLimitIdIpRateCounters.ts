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
 * Search IP rate counters (todo_app_ip_rate_counters) for a specific rate limit
 * policy.
 *
 * Retrieves a filtered, paginated list of IP rate counters bound to the
 * provided rateLimitId. Supports optional IP substring, window bounds,
 * blocked-only filter, and simple sorting. Soft-deleted rows are excluded.
 *
 * Authorization: systemAdmin only. Verifies active, non-revoked admin
 * membership and owning user account state before proceeding.
 *
 * @param props - Request properties
 * @param props.systemAdmin - Authenticated system admin payload (JWT-derived)
 * @param props.rateLimitId - UUID of the rate limit policy to constrain results
 * @param props.body - Search criteria (pagination, filters, sorting)
 * @returns Paginated summaries of IP rate counters for the given policy
 * @throws {HttpException} 403 when the caller lacks admin privileges
 */
export async function patchtodoAppSystemAdminRateLimitsRateLimitIdIpRateCounters(props: {
  systemAdmin: SystemadminPayload;
  rateLimitId: string & tags.Format<"uuid">;
  body: ITodoAppIpRateCounter.IRequest;
}): Promise<IPageITodoAppIpRateCounter.ISummary> {
  const { systemAdmin, rateLimitId, body } = props;

  // Authorization: ensure systemAdmin membership is active and owner user is valid
  const adminMembership = await MyGlobal.prisma.todo_app_systemadmins.findFirst(
    {
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
    },
  );
  if (adminMembership === null) {
    throw new HttpException("Forbidden: System admin privileges required", 403);
  }

  // Pagination with bounds and defaults
  const rawPage =
    body.page !== undefined && body.page !== null ? Number(body.page) : 1;
  const page = rawPage >= 1 ? rawPage : 1;
  const rawLimit =
    body.limit !== undefined && body.limit !== null ? Number(body.limit) : 20;
  const limit = rawLimit < 1 ? 20 : rawLimit > 100 ? 100 : rawLimit;
  const skip = (page - 1) * limit;

  // Time reference for blocked_only
  const now = toISOStringSafe(new Date());

  // Build shared where condition (allowed for complex conditions)
  const whereCondition = {
    deleted_at: null,
    todo_app_rate_limit_id: rateLimitId,
    ...(body.ip !== undefined &&
      body.ip !== null &&
      body.ip.length > 0 && {
        ip: { contains: body.ip },
      }),
    // Window bounds
    ...(() => {
      const hasFrom =
        body.window_from !== undefined && body.window_from !== null;
      const hasTo = body.window_to !== undefined && body.window_to !== null;
      if (!hasFrom && !hasTo) return {};
      return {
        ...(hasFrom && {
          window_started_at: {
            gte: toISOStringSafe(
              body.window_from as string & tags.Format<"date-time">,
            ),
          },
        }),
        ...(hasTo && {
          window_ends_at: {
            lte: toISOStringSafe(
              body.window_to as string & tags.Format<"date-time">,
            ),
          },
        }),
      };
    })(),
    ...(body.blocked_only === true && {
      blocked_until: { gte: now },
    }),
  } as const;

  // Parse sort expression
  const sortExpr = typeof body.sort === "string" ? body.sort.trim() : "";
  const tokens = sortExpr.split(/\s+/).filter((t) => t.length > 0);
  const sortFieldToken = (tokens[0] ?? "").toLowerCase();
  const sortDesc = (tokens[1] ?? "").toLowerCase() === "asc" ? false : true; // default desc

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_ip_rate_counters.findMany({
      where: whereCondition,
      orderBy: (() => {
        switch (sortFieldToken) {
          case "window_ends_at":
            return sortDesc
              ? { window_ends_at: "desc" }
              : { window_ends_at: "asc" };
          case "last_action_at":
            return sortDesc
              ? { last_action_at: "desc" }
              : { last_action_at: "asc" };
          case "blocked_until":
            return sortDesc
              ? { blocked_until: "desc" }
              : { blocked_until: "asc" };
          case "count":
            return sortDesc ? { count: "desc" } : { count: "asc" };
          case "created_at":
            return sortDesc ? { created_at: "desc" } : { created_at: "asc" };
          case "updated_at":
            return sortDesc ? { updated_at: "desc" } : { updated_at: "asc" };
          case "ip":
            return sortDesc ? { ip: "desc" } : { ip: "asc" };
          case "window_started_at":
          default:
            return sortDesc
              ? { window_started_at: "desc" }
              : { window_started_at: "asc" };
        }
      })(),
      skip,
      take: limit,
    }),
    MyGlobal.prisma.todo_app_ip_rate_counters.count({ where: whereCondition }),
  ]);

  const data: ITodoAppIpRateCounter.ISummary[] = rows.map((row) => ({
    id: row.id as string & tags.Format<"uuid">,
    todo_app_rate_limit_id: row.todo_app_rate_limit_id as string &
      tags.Format<"uuid">,
    ip: row.ip,
    window_started_at: toISOStringSafe(row.window_started_at),
    window_ends_at: toISOStringSafe(row.window_ends_at),
    count: row.count as number & tags.Type<"int32">,
    last_action_at: row.last_action_at
      ? toISOStringSafe(row.last_action_at)
      : null,
    blocked_until: row.blocked_until
      ? toISOStringSafe(row.blocked_until)
      : null,
  }));

  const records = Number(total);
  const pages = records === 0 ? 0 : Math.ceil(records / Number(limit));

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: records,
      pages: Number(pages),
    },
    data,
  };
}
