import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppAccountStatusChange } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAccountStatusChange";
import { IPageITodoAppAccountStatusChange } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppAccountStatusChange";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Search and retrieve paginated account status changes
 * (todo_app_account_status_changes) for governance.
 *
 * Lists/searches account lifecycle transition records with pagination, sorting,
 * and filters. Access is restricted to system administrators. Results exclude
 * soft-deleted rows. Supported filters: target_user_id, admin_user_id,
 * previous_status, new_status, has_effect, created_at range (from/to), and
 * free-text search over business_reason. Sorting by created_at, new_status, or
 * has_effect with direction asc/desc. Defaults to created_at desc.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator payload
 * @param props.body - Filtering, sorting, and pagination parameters
 * @returns Paginated list of account status change summaries
 * @throws {HttpException} 401/403 when not authorized as system admin
 * @throws {HttpException} 400 on invalid filters (pagination bounds, reversed
 *   date range)
 */
export async function patchtodoAppSystemAdminAccountStatusChanges(props: {
  systemAdmin: SystemadminPayload;
  body: ITodoAppAccountStatusChange.IRequest;
}): Promise<IPageITodoAppAccountStatusChange.ISummary> {
  const { systemAdmin, body } = props;

  // Authorization: verify current system admin membership and owning user state
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
  if (!membership)
    throw new HttpException("Forbidden: Admin privileges required", 403);

  // Pagination defaults and validation
  const pageInput = body.page ?? 1;
  const limitInput = body.limit ?? 20;
  if (pageInput < 1)
    throw new HttpException("Bad Request: page must be >= 1", 400);
  if (limitInput < 1 || limitInput > 100)
    throw new HttpException(
      "Bad Request: limit must be between 1 and 100",
      400,
    );
  const page = Number(pageInput);
  const limit = Number(limitInput);
  const skip = (page - 1) * limit;

  // Date range validation (ISO 8601 strings compare lexicographically)
  if (
    body.created_at_from !== undefined &&
    body.created_at_from !== null &&
    body.created_at_to !== undefined &&
    body.created_at_to !== null &&
    body.created_at_from > body.created_at_to
  ) {
    throw new HttpException(
      "Bad Request: created_at_from must be less than or equal to created_at_to",
      400,
    );
  }

  // OrderBy handling
  const allowedOrderBy: ITodoAppAccountStatusChange.EOrderBy[] = [
    "created_at",
    "new_status",
    "has_effect",
  ];
  const orderByField =
    body.orderBy && allowedOrderBy.includes(body.orderBy)
      ? body.orderBy
      : ("created_at" as ITodoAppAccountStatusChange.EOrderBy);
  const orderDirection = body.orderDirection === "asc" ? "asc" : "desc";

  // WHERE condition (allowed exception for readability & reuse)
  const whereCondition = {
    deleted_at: null,
    ...(body.target_user_id !== undefined &&
      body.target_user_id !== null && {
        target_user_id: body.target_user_id,
      }),
    ...(body.admin_user_id !== undefined &&
      body.admin_user_id !== null && {
        admin_user_id: body.admin_user_id,
      }),
    ...(body.previous_status !== undefined &&
      body.previous_status !== null && {
        previous_status: body.previous_status,
      }),
    ...(body.new_status !== undefined &&
      body.new_status !== null && {
        new_status: body.new_status,
      }),
    ...(body.has_effect !== undefined &&
      body.has_effect !== null && {
        has_effect: body.has_effect,
      }),
    ...((body.created_at_from !== undefined && body.created_at_from !== null) ||
    (body.created_at_to !== undefined && body.created_at_to !== null)
      ? {
          created_at: {
            ...(body.created_at_from !== undefined &&
              body.created_at_from !== null && {
                gte: body.created_at_from,
              }),
            ...(body.created_at_to !== undefined &&
              body.created_at_to !== null && {
                lte: body.created_at_to,
              }),
          },
        }
      : {}),
    ...(body.q !== undefined &&
      body.q !== null &&
      body.q.length > 0 && {
        business_reason: { contains: body.q },
      }),
  };

  // Fetch results and total count in parallel
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_account_status_changes.findMany({
      where: whereCondition,
      select: {
        id: true,
        target_user_id: true,
        previous_status: true,
        new_status: true,
        has_effect: true,
        created_at: true,
      },
      orderBy:
        orderByField === "created_at"
          ? { created_at: orderDirection }
          : orderByField === "new_status"
            ? { new_status: orderDirection }
            : { has_effect: orderDirection },
      skip,
      take: limit,
    }),
    MyGlobal.prisma.todo_app_account_status_changes.count({
      where: whereCondition,
    }),
  ]);

  // Map to summaries with proper date conversion
  const data = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    target_user_id: r.target_user_id as string & tags.Format<"uuid">,
    previous_status: r.previous_status,
    new_status: r.new_status,
    has_effect: r.has_effect,
    created_at: toISOStringSafe(r.created_at),
  }));

  const records = Number(total);
  const pages = records === 0 ? 0 : Math.ceil(records / limit);

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records,
      pages,
    },
    data,
  };
}
