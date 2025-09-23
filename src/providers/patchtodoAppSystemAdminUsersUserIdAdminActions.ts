import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppAdminAction } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAdminAction";
import { IPageITodoAppAdminAction } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppAdminAction";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Search administrative actions (todo_app_admin_actions) affecting a specific
 * user (admin-only).
 *
 * Provides a read-only, paginated search over privileged administrative actions
 * scoped to the target user identified by {userId}. Supports filtering (action,
 * success, created_at range), text search across reason/notes, and sorting by
 * created_at/action/success. Access is restricted to system administrators.
 *
 * Authorization: Requires a valid SystemadminPayload and current, non-revoked
 * system admin role, with the owning user account active, verified, and not
 * deleted.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator payload
 * @param props.userId - Target user's UUID to scope administrative actions
 * @param props.body - Pagination, sorting, and filtering parameters
 * @returns Paginated administrative action records related to the specified
 *   user
 * @throws {HttpException} 401/403 when authorization fails
 * @throws {HttpException} 404 when the target user does not exist or is deleted
 */
export async function patchtodoAppSystemAdminUsersUserIdAdminActions(props: {
  systemAdmin: SystemadminPayload;
  userId: string & tags.Format<"uuid">;
  body: ITodoAppAdminAction.IRequest;
}): Promise<IPageITodoAppAdminAction> {
  const { systemAdmin, userId, body } = props;

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
  if (!membership) throw new HttpException("Forbidden", 403);

  // Verify target user existence (not soft-deleted)
  const targetUser = await MyGlobal.prisma.todo_app_users.findFirst({
    where: { id: userId, deleted_at: null },
  });
  if (!targetUser) throw new HttpException("Not Found", 404);

  // Pagination defaults and bounds
  const pageRaw = body.page ?? (1 as unknown as number);
  const limitRaw = body.limit ?? (20 as unknown as number);
  const page = Number(pageRaw);
  const limit = Math.max(1, Math.min(100, Number(limitRaw)));
  const skip = (page - 1) * limit;

  // Sorting parameters with safe defaults
  const orderByField: ITodoAppAdminAction.EOrderBy =
    body.orderBy === "action" ||
    body.orderBy === "success" ||
    body.orderBy === "created_at"
      ? body.orderBy
      : "created_at";
  const orderDir: "asc" | "desc" =
    body.orderDirection === "asc" ? "asc" : "desc";

  // Build where condition (deleted_at null → exclude soft-deleted admin actions)
  const whereCondition = {
    deleted_at: null,
    target_user_id: userId,
    ...(body.admin_user_id !== undefined &&
      body.admin_user_id !== null && {
        admin_user_id: body.admin_user_id,
      }),
    ...(body.action !== undefined &&
      body.action !== null && { action: body.action }),
    ...(body.success !== undefined &&
      body.success !== null && { success: body.success }),
    ...(() => {
      const from =
        body.created_at_from !== undefined && body.created_at_from !== null
          ? toISOStringSafe(body.created_at_from)
          : undefined;
      const to =
        body.created_at_to !== undefined && body.created_at_to !== null
          ? toISOStringSafe(body.created_at_to)
          : undefined;
      if (from === undefined && to === undefined) return {};
      return {
        created_at: {
          ...(from !== undefined && { gte: from }),
          ...(to !== undefined && { lte: to }),
        },
      };
    })(),
    ...(() => {
      const term =
        body.q !== undefined && body.q !== null && body.q.trim().length > 0
          ? body.q.trim()
          : undefined;
      if (term === undefined) return {};
      return {
        OR: [{ reason: { contains: term } }, { notes: { contains: term } }],
      };
    })(),
  };

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_admin_actions.findMany({
      where: whereCondition,
      orderBy:
        orderByField === "created_at"
          ? { created_at: orderDir }
          : orderByField === "action"
            ? { action: orderDir }
            : { success: orderDir },
      skip,
      take: limit,
    }),
    MyGlobal.prisma.todo_app_admin_actions.count({ where: whereCondition }),
  ]);

  const data: ITodoAppAdminAction[] = rows.map((row) => ({
    id: typia.assert<string & tags.Format<"uuid">>(row.id),
    admin_user_id: typia.assert<string & tags.Format<"uuid">>(
      row.admin_user_id,
    ),
    target_user_id:
      row.target_user_id !== null && row.target_user_id !== undefined
        ? typia.assert<string & tags.Format<"uuid">>(row.target_user_id)
        : null,
    action: row.action,
    reason: row.reason ?? null,
    notes: row.notes ?? null,
    success: row.success,
    idempotency_key: row.idempotency_key ?? null,
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
    deleted_at: row.deleted_at ? toISOStringSafe(row.deleted_at) : null,
  }));

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: Number(total),
      pages: Number(Math.ceil(total / (limit || 1))),
    },
    data,
  };
}
