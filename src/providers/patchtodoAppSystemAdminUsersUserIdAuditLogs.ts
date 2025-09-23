import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppAuditLog } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAuditLog";
import { IPageITodoAppAuditLog } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppAuditLog";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Search audit logs (todo_app_audit_logs) for a specific user by path userId
 * (admin-only).
 *
 * Provides a read-only, paginated search over audit records related to the
 * specified user. Results include actor attribution, optional target
 * attribution, action classification, resource context, outcome, and client
 * metadata. Restricted to system administrators.
 *
 * Authorization: The caller must be an active, non-revoked system administrator
 * whose owning user account is active, verified, and not soft-deleted.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator payload
 * @param props.userId - Target user's UUID to scope audit retrieval (actor
 *   and/or target)
 * @param props.body - Search, filter, sort and pagination parameters
 * @returns Paginated set of audit log entries associated with the specified
 *   user
 * @throws {HttpException} 401/403 when not authorized
 * @throws {HttpException} 400 when request parameters are invalid (e.g.,
 *   oversized limit)
 */
export async function patchtodoAppSystemAdminUsersUserIdAuditLogs(props: {
  systemAdmin: SystemadminPayload;
  userId: string & tags.Format<"uuid">;
  body: ITodoAppAuditLog.IRequest;
}): Promise<IPageITodoAppAuditLog> {
  const { systemAdmin, userId, body } = props;

  // Authorization: verify active system admin membership and owning user state
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

  // Pagination defaults and validation
  const rawPage = body.page ?? 1;
  const rawLimit = body.limit ?? 20;
  // enforce upper bound per policy (tags.Maximum<100>)
  if (rawLimit !== null && rawLimit !== undefined && Number(rawLimit) > 100)
    throw new HttpException("Bad Request: limit must be <= 100", 400);
  const page = Math.max(1, Number(rawPage));
  const limit = Math.max(1, Number(rawLimit));
  const skip = (page - 1) * limit;

  // Build where condition (complex builder allowed)
  const whereCondition = {
    deleted_at: null,
    OR: [{ actor_user_id: userId }, { target_user_id: userId }],
    ...(body.actor_user_id !== undefined &&
      body.actor_user_id !== null && {
        actor_user_id: body.actor_user_id,
      }),
    ...(body.target_user_id !== undefined &&
      body.target_user_id !== null && {
        target_user_id: body.target_user_id,
      }),
    ...(body.action !== undefined &&
      body.action !== null && {
        action: { contains: body.action },
      }),
    ...(body.resource_type !== undefined &&
      body.resource_type !== null && {
        resource_type: { contains: body.resource_type },
      }),
    ...(body.resource_id !== undefined &&
      body.resource_id !== null && {
        resource_id: body.resource_id,
      }),
    ...(body.success !== undefined &&
      body.success !== null && {
        success: body.success,
      }),
    ...(body.ip !== undefined &&
      body.ip !== null && {
        ip: { contains: body.ip },
      }),
    ...(body.user_agent !== undefined &&
      body.user_agent !== null && {
        user_agent: { contains: body.user_agent },
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
  const sortBy: "created_at" | "action" | "success" = (body.sort_by ??
    "created_at") as "created_at" | "action" | "success";
  const sortDir: "asc" | "desc" = (body.sort_dir ?? "desc") as "asc" | "desc";

  // Query rows and total count concurrently
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_audit_logs.findMany({
      where: whereCondition,
      orderBy:
        sortBy === "created_at"
          ? { created_at: sortDir }
          : sortBy === "action"
            ? { action: sortDir }
            : { success: sortDir },
      skip,
      take: limit,
      select: {
        id: true,
        actor_user_id: true,
        target_user_id: true,
        action: true,
        resource_type: true,
        resource_id: true,
        success: true,
        ip: true,
        user_agent: true,
        created_at: true,
        updated_at: true,
        deleted_at: true,
      },
    }),
    MyGlobal.prisma.todo_app_audit_logs.count({ where: whereCondition }),
  ]);

  const data: ITodoAppAuditLog[] = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    actor_user_id: r.actor_user_id as string & tags.Format<"uuid">,
    target_user_id:
      r.target_user_id === null
        ? null
        : (r.target_user_id as string & tags.Format<"uuid">),
    action: r.action,
    resource_type: r.resource_type ?? null,
    resource_id: r.resource_id ?? null,
    success: r.success,
    ip: r.ip ?? null,
    user_agent: r.user_agent ?? null,
    created_at: toISOStringSafe(r.created_at),
    updated_at: toISOStringSafe(r.updated_at),
    deleted_at: r.deleted_at ? toISOStringSafe(r.deleted_at) : null,
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
