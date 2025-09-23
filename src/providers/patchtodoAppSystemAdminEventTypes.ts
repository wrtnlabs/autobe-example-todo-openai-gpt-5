import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEventType";
import { IPageITodoAppEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppEventType";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Search and paginate event type taxonomy (todo_app_event_types)
 *
 * Retrieves a filtered, paginated collection of event type definitions used to
 * classify domain events (e.g., "todo.created"). Supports filters (active,
 * code, name, search), created_at range (created_from/to), sorting by
 * created_at/updated_at/code/name, and pagination.
 *
 * Authorization: System administrator privileges required. Verifies that the
 * provided systemAdmin payload corresponds to an active, non-revoked admin
 * membership and an active/verified user account.
 *
 * @param props - Request properties
 * @param props.systemAdmin - Authenticated system administrator payload
 * @param props.body - Search, filter, sort, and pagination parameters
 * @returns Paged collection of event type summaries
 * @throws {HttpException} 401/403 when authorization fails
 * @throws {HttpException} 400 when pagination/sort parameters are invalid
 */
export async function patchtodoAppSystemAdminEventTypes(props: {
  systemAdmin: SystemadminPayload;
  body: ITodoAppEventType.IRequest;
}): Promise<IPageITodoAppEventType.ISummary> {
  const { systemAdmin, body } = props;

  // Authorization: ensure active admin membership and valid user state
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
      "Unauthorized: System administrator privileges required",
      403,
    );
  }

  // Pagination defaults and validation
  const pageRaw = body.page ?? 1;
  const limitRaw = body.limit ?? 20;
  const page = Number(pageRaw);
  const limit = Number(limitRaw);
  if (!Number.isFinite(page) || page < 1) {
    throw new HttpException("Bad Request: Invalid page (must be >= 1)", 400);
  }
  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    throw new HttpException("Bad Request: Invalid limit (must be 1..100)", 400);
  }
  const skip = (page - 1) * limit;

  // Build where condition
  const whereCondition = {
    ...(body.active !== undefined &&
      body.active !== null && { active: body.active }),
    ...(body.code !== undefined &&
      body.code !== null &&
      body.code.length > 0 && {
        code: { contains: body.code },
      }),
    ...(body.name !== undefined &&
      body.name !== null &&
      body.name.length > 0 && {
        name: { contains: body.name },
      }),
    ...(body.search !== undefined &&
      body.search !== null &&
      body.search.length > 0 && {
        OR: [
          { code: { contains: body.search } },
          { name: { contains: body.search } },
          { description: { contains: body.search } },
        ],
      }),
    ...((body.created_from !== undefined && body.created_from !== null) ||
    (body.created_to !== undefined && body.created_to !== null)
      ? {
          created_at: {
            ...(body.created_from !== undefined &&
              body.created_from !== null && {
                gte: body.created_from,
              }),
            ...(body.created_to !== undefined &&
              body.created_to !== null && {
                lte: body.created_to,
              }),
          },
        }
      : {}),
  };

  // Sorting
  const sortKey = body.sort?.key ?? "created_at";
  const sortOrder: "asc" | "desc" = body.sort?.order ?? "desc";
  const orderBy =
    sortKey === "code"
      ? { code: sortOrder }
      : sortKey === "name"
        ? { name: sortOrder }
        : sortKey === "updated_at"
          ? { updated_at: sortOrder }
          : { created_at: sortOrder };

  // Query data and total count
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_event_types.findMany({
      where: whereCondition,
      orderBy: orderBy,
      skip,
      take: limit,
      select: {
        id: true,
        code: true,
        name: true,
        active: true,
        created_at: true,
      },
    }),
    MyGlobal.prisma.todo_app_event_types.count({
      where: whereCondition,
    }),
  ]);

  // Map to DTO
  const data = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    code: r.code,
    name: r.name,
    active: r.active,
    created_at: toISOStringSafe(r.created_at),
  }));

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: Number(total),
      pages: Number(Math.ceil(total / limit)),
    },
    data,
  };
}
