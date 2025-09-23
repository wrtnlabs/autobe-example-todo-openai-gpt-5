import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppRateLimit } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppRateLimit";
import { IPageITodoAppRateLimit } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppRateLimit";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

export async function patchtodoAppSystemAdminRateLimits(props: {
  systemAdmin: SystemadminPayload;
  body: ITodoAppRateLimit.IRequest;
}): Promise<IPageITodoAppRateLimit.ISummary> {
  /**
   * List and search rate limit policies from Prisma table todo_app_rate_limits
   *
   * Retrieves a filtered, paginated list of rate limit policies. Supports
   * filters for scope, category, enabled, sliding_window, numeric ranges
   * (window_seconds, max_requests), and free-text search across
   * code/name/description. Excludes soft-deleted records.
   *
   * Authorization: Only system administrators may access this endpoint. The
   * function verifies active admin membership and the owning user account
   * state.
   *
   * @param props - Request properties
   * @param props.systemAdmin - The authenticated system administrator payload
   * @param props.body - Search, filter, and pagination parameters
   * @returns Paginated collection of rate limit policy summaries
   * @throws {HttpException} 401/403 when unauthorized or membership invalid
   */
  const { systemAdmin, body } = props;

  // Authorization: ensure active system admin membership and valid user state
  const membership = await MyGlobal.prisma.todo_app_systemadmins.findFirst({
    where: {
      todo_app_user_id: systemAdmin.id,
      revoked_at: null,
      deleted_at: null,
    },
  });
  if (!membership) {
    throw new HttpException(
      "Forbidden: Only system administrators can access this resource",
      403,
    );
  }
  const adminUser = await MyGlobal.prisma.todo_app_users.findUnique({
    where: { id: systemAdmin.id },
    select: { id: true, status: true, email_verified: true, deleted_at: true },
  });
  if (
    !adminUser ||
    adminUser.deleted_at !== null ||
    adminUser.status !== "active" ||
    adminUser.email_verified !== true
  ) {
    throw new HttpException(
      "Forbidden: Administrator account is not active or verified",
      403,
    );
  }

  // Pagination defaults and normalization
  const rawPage = body.page ?? 1;
  const rawLimit = body.limit ?? 20;
  const page = Number(rawPage);
  let limit = Number(rawLimit);
  if (!Number.isFinite(limit) || limit < 1) limit = 20;
  if (limit > 100) limit = 100;
  const safePage = Number.isFinite(page) && page >= 1 ? page : 1;
  const skip = (safePage - 1) * limit;

  // Build where condition (exclude soft-deleted)
  const search = (body.search ?? "").trim();
  const hasSearch = search.length > 0;
  const whereCondition = {
    deleted_at: null,
    // Equality filters
    ...(body.scope !== undefined &&
      body.scope !== null && { scope: body.scope }),
    ...(body.category !== undefined &&
      body.category !== null && { category: body.category }),
    ...(body.enabled !== undefined &&
      body.enabled !== null && { enabled: body.enabled }),
    ...(body.sliding_window !== undefined &&
      body.sliding_window !== null && { sliding_window: body.sliding_window }),
    // Numeric ranges
    ...((body.window_seconds_min !== undefined &&
      body.window_seconds_min !== null) ||
    (body.window_seconds_max !== undefined && body.window_seconds_max !== null)
      ? {
          window_seconds: {
            ...(body.window_seconds_min !== undefined &&
              body.window_seconds_min !== null && {
                gte: body.window_seconds_min,
              }),
            ...(body.window_seconds_max !== undefined &&
              body.window_seconds_max !== null && {
                lte: body.window_seconds_max,
              }),
          },
        }
      : {}),
    ...((body.max_requests_min !== undefined &&
      body.max_requests_min !== null) ||
    (body.max_requests_max !== undefined && body.max_requests_max !== null)
      ? {
          max_requests: {
            ...(body.max_requests_min !== undefined &&
              body.max_requests_min !== null && {
                gte: body.max_requests_min,
              }),
            ...(body.max_requests_max !== undefined &&
              body.max_requests_max !== null && {
                lte: body.max_requests_max,
              }),
          },
        }
      : {}),
    // Free-text search across text fields (cross-DB compatible)
    ...(hasSearch && {
      OR: [
        { code: { contains: search } },
        { name: { contains: search } },
        { description: { contains: search } },
      ],
    }),
  };

  // Query rows and total count concurrently
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_rate_limits.findMany({
      where: whereCondition,
      select: {
        id: true,
        code: true,
        name: true,
        scope: true,
        category: true,
        window_seconds: true,
        max_requests: true,
        enabled: true,
        created_at: true,
      },
      orderBy: { created_at: "desc" },
      skip,
      take: limit,
    }),
    MyGlobal.prisma.todo_app_rate_limits.count({ where: whereCondition }),
  ]);

  // Map to summary items with proper date conversion
  const data = rows.map((row) => ({
    id: row.id as string & tags.Format<"uuid">,
    code: row.code,
    name: row.name,
    scope: row.scope,
    category: row.category,
    window_seconds: row.window_seconds as number & tags.Type<"int32">,
    max_requests: row.max_requests as number & tags.Type<"int32">,
    enabled: row.enabled,
    created_at: toISOStringSafe(row.created_at),
  }));

  const pages = limit > 0 ? Math.ceil(total / limit) : 0;

  return {
    pagination: {
      current: Number(safePage),
      limit: Number(limit),
      records: Number(total),
      pages: Number(pages),
    },
    data,
  };
}
