import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppAuditLog } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAuditLog";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Get one audit log entry (todo_app_audit_logs) by ID.
 *
 * Retrieves a single audit log row by its primary key from Prisma table
 * todo_app_audit_logs. Access is restricted to authenticated system admins. The
 * response includes actor/target references, action, resource context, outcome,
 * client metadata, and timestamps.
 *
 * Authorization: Validates current system admin membership (not revoked, not
 * soft-deleted) and that the owning user account is active, verified, and not
 * deleted.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system admin payload
 * @param props.auditLogId - UUID of the audit log entry to retrieve
 * @returns Detailed ITodoAppAuditLog entity
 * @throws {HttpException} 403 when the caller is not an active system admin
 * @throws {HttpException} 404 when the audit log entry does not exist
 */
export async function gettodoAppSystemAdminAuditLogsAuditLogId(props: {
  systemAdmin: SystemadminPayload;
  auditLogId: string & tags.Format<"uuid">;
}): Promise<ITodoAppAuditLog> {
  const { systemAdmin, auditLogId } = props;

  // Authorization: ensure caller is an active system admin and user is valid
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
  if (!adminMembership) throw new HttpException("Forbidden", 403);

  // Fetch the audit log entry
  const row = await MyGlobal.prisma.todo_app_audit_logs.findUnique({
    where: { id: auditLogId },
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
  });
  if (!row) throw new HttpException("Not Found", 404);

  // Map to DTO with proper date-time conversions and null handling
  const result: ITodoAppAuditLog = {
    id: row.id as string & tags.Format<"uuid">,
    actor_user_id: row.actor_user_id as string & tags.Format<"uuid">,
    target_user_id:
      row.target_user_id === null
        ? null
        : (row.target_user_id as string & tags.Format<"uuid">),
    action: row.action,
    resource_type: row.resource_type ?? null,
    resource_id: row.resource_id ?? null,
    success: row.success,
    ip: row.ip ?? null,
    user_agent: row.user_agent ?? null,
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
    deleted_at: row.deleted_at ? toISOStringSafe(row.deleted_at) : null,
  };

  return result;
}
