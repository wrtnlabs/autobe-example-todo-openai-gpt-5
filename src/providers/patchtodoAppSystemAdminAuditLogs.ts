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
 * Search audit logs (todo_app_audit_logs) with filters, sorting, and pagination
 *
 * Queries audit entries from todo_app_audit_logs with optional filters for
 * actor/target users, action/resource, outcome, client context, and created_at
 * time range. Only accessible by systemAdmin users.
 *
 * Authorization: Requires an authenticated System Admin. Verifies active,
 * non-revoked system admin membership and active/verified user state.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system admin payload
 * @param props.body - Filtering, sorting, and pagination parameters
 * @returns Paginated audit log summaries matching the search criteria
 * @throws {HttpException} 401 when unauthenticated (handled upstream)
 * @throws {HttpException} 403 when not a valid active system admin
 * @throws {HttpException} 400 for invalid inputs (e.g., illogical date range)
 */
export async function patchtodoAppSystemAdminAuditLogs(props: {
  systemAdmin: SystemadminPayload;
  body: ITodoAppAuditLog.IRequest;
}): Promise<IPageITodoAppAuditLog.ISummary> {
  const { systemAdmin, body } = props;

  // Authorization: ensure caller is an active system admin and user is valid
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

  // Pagination defaults and clamping
  const pageInput = body.page ?? 1;
  const limitInput = body.limit ?? 20;
  const page = pageInput < 1 ? 1 : pageInput;
  const limit = limitInput < 1 ? 1 : limitInput > 100 ? 100 : limitInput;
  const skip = (page - 1) * limit;

  // Sorting defaults and safety
  const sortBy: "created_at" | "action" | "success" =
    body.sort_by === "action" ||
    body.sort_by === "success" ||
    body.sort_by === "created_at"
      ? body.sort_by
      : "created_at";
  const sortDir: "asc" | "desc" = body.sort_dir === "asc" ? "asc" : "desc";

  // Time range validation and conversion
  const createdFromISO = body.created_from
    ? toISOStringSafe(body.created_from)
    : undefined;
  const createdToISO = body.created_to
    ? toISOStringSafe(body.created_to)
    : undefined;
  if (createdFromISO !== undefined && createdToISO !== undefined) {
    if (createdFromISO > createdToISO)
      throw new HttpException(
        "Bad Request: created_from must be <= created_to",
        400,
      );
  }

  // Build where conditions (exclude soft-deleted rows)
  const whereCondition = {
    deleted_at: null,
    // Equality filters for IDs
    ...(body.actor_user_id !== undefined &&
      body.actor_user_id !== null && {
        actor_user_id: body.actor_user_id,
      }),
    ...(body.target_user_id !== undefined &&
      body.target_user_id !== null && {
        target_user_id: body.target_user_id,
      }),
    // Exact or substring filters for text fields
    ...(body.action !== undefined &&
      body.action !== null &&
      body.action !== "" && {
        action: { contains: body.action },
      }),
    ...(body.resource_type !== undefined &&
      body.resource_type !== null &&
      body.resource_type !== "" && {
        resource_type: { contains: body.resource_type },
      }),
    ...(body.resource_id !== undefined &&
      body.resource_id !== null &&
      body.resource_id !== "" && {
        resource_id: body.resource_id,
      }),
    ...(body.success !== undefined &&
      body.success !== null && { success: body.success }),
    ...(body.ip !== undefined &&
      body.ip !== null &&
      body.ip !== "" && { ip: { contains: body.ip } }),
    ...(body.user_agent !== undefined &&
      body.user_agent !== null &&
      body.user_agent !== "" && {
        user_agent: { contains: body.user_agent },
      }),
    // Date range over created_at
    ...(createdFromISO !== undefined || createdToISO !== undefined
      ? {
          created_at: {
            ...(createdFromISO !== undefined && { gte: createdFromISO }),
            ...(createdToISO !== undefined && { lte: createdToISO }),
          },
        }
      : {}),
  };

  // Execute queries in parallel
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_audit_logs.findMany({
      where: whereCondition,
      select: {
        id: true,
        actor_user_id: true,
        target_user_id: true,
        action: true,
        success: true,
        created_at: true,
      },
      orderBy:
        sortBy === "action"
          ? { action: sortDir }
          : sortBy === "success"
            ? { success: sortDir }
            : { created_at: sortDir },
      skip,
      take: limit,
    }),
    MyGlobal.prisma.todo_app_audit_logs.count({ where: whereCondition }),
  ]);

  // Map to DTO with proper type handling (dates → ISO strings; null → undefined for optional fields)
  const data: ITodoAppAuditLog.ISummary[] = rows.map((r) => ({
    id: r.id,
    actor_user_id: r.actor_user_id,
    target_user_id: r.target_user_id === null ? undefined : r.target_user_id,
    action: r.action,
    success: r.success,
    created_at: toISOStringSafe(r.created_at),
  }));

  const records = total;
  const pages = Math.ceil(records / limit);

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: Number(records),
      pages: Number(pages),
    },
    data,
  };
}
