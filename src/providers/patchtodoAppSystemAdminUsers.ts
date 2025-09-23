import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUser";
import { IPageITodoAppUser } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppUser";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Search and paginate users (todo_app_users) for administration.
 *
 * Retrieves a filtered, paginated list of user accounts with optional keyword
 * search, status and email_verified filters, time window filters (created_at,
 * last_login_at), and sorting controls. Excludes soft-deleted users by default
 * and never exposes secrets like password hashes. Only accessible to system
 * administrators.
 *
 * Authorization: Validates that the requester holds an active systemAdmin role
 * assignment.
 *
 * @param props - Request context and parameters
 * @param props.systemAdmin - Authenticated System Admin payload
 * @param props.body - Search, filter, sort, and pagination parameters
 * @returns Paginated list of user summaries for administrative views
 * @throws {HttpException} 401/403 when not authorized as system admin
 * @throws {HttpException} 400 when pagination or sorting parameters are invalid
 */
export async function patchtodoAppSystemAdminUsers(props: {
  systemAdmin: SystemadminPayload;
  body: ITodoAppUser.IRequest;
}): Promise<IPageITodoAppUser.ISummary> {
  const { systemAdmin, body } = props;

  // Authorization: ensure requester is an active system admin
  const membership = await MyGlobal.prisma.todo_app_systemadmins.findFirst({
    where: {
      todo_app_user_id: systemAdmin.id,
      revoked_at: null,
      deleted_at: null,
      user: { deleted_at: null },
    },
  });
  if (!membership)
    throw new HttpException(
      "Unauthorized: Only system admins may access this resource",
      403,
    );

  // Pagination defaults and validation
  const page: number = Number(body.page ?? 1);
  const limit: number = Number(body.limit ?? 20);
  if (!(page >= 1))
    throw new HttpException("Bad Request: page must be >= 1", 400);
  if (limit < 1 || limit > 100)
    throw new HttpException(
      "Bad Request: limit must be between 1 and 100",
      400,
    );
  const skip: number = (page - 1) * limit;

  // Sorting controls (default created_at desc)
  const dir: "asc" | "desc" = body.order_direction === "asc" ? "asc" : "desc";
  const orderBy =
    (body.order_by ?? "created_at") === "created_at"
      ? { created_at: dir }
      : body.order_by === "updated_at"
        ? { updated_at: dir }
        : body.order_by === "email"
          ? { email: dir }
          : body.order_by === "last_login_at"
            ? { last_login_at: dir }
            : { status: dir };

  // WHERE conditions (exclude soft-deleted by default)
  const whereCondition = {
    deleted_at: null,
    // Optional filters
    ...(Array.isArray(body.ids) &&
      body.ids.length > 0 && { id: { in: body.ids } }),
    ...(typeof body.search === "string" &&
      body.search.trim().length > 0 && {
        email: { contains: body.search.trim() },
      }),
    ...(Array.isArray(body.status) &&
      body.status.length > 0 && {
        status: { in: body.status },
      }),
    ...(typeof body.email_verified === "boolean" && {
      email_verified: body.email_verified,
    }),
    // created_at range
    ...(() => {
      const from = body.created_at_from;
      const to = body.created_at_to;
      if (!from && !to) return {};
      return {
        created_at: {
          ...(from && { gte: from }),
          ...(to && { lte: to }),
        },
      };
    })(),
    // last_login_at range (nullable column)
    ...(() => {
      const from = body.last_login_at_from;
      const to = body.last_login_at_to;
      if (!from && !to) return {};
      return {
        last_login_at: {
          ...(from && { gte: from }),
          ...(to && { lte: to }),
        },
      };
    })(),
  };

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_users.findMany({
      where: whereCondition,
      orderBy: orderBy,
      skip: skip,
      take: limit,
      select: {
        id: true,
        email: true,
        status: true,
        email_verified: true,
        created_at: true,
        last_login_at: true,
      },
    }),
    MyGlobal.prisma.todo_app_users.count({ where: whereCondition }),
  ]);

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: Number(total),
      pages: Math.ceil(Number(total) / Number(limit)),
    },
    data: rows.map((u) => ({
      id: u.id as string & tags.Format<"uuid">,
      email: u.email as string & tags.Format<"email">,
      status: u.status,
      email_verified: u.email_verified,
      created_at: toISOStringSafe(u.created_at),
      last_login_at: u.last_login_at ? toISOStringSafe(u.last_login_at) : null,
    })),
  };
}
