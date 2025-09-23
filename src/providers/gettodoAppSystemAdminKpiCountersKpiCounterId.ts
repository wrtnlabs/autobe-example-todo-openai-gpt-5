import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppKpiCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppKpiCounter";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Get a single KPI window snapshot from Prisma table mv_todo_app_kpi_counters
 * by ID (admin-only).
 *
 * Returns the detailed KPI window snapshot for the specified identifier. Access
 * is restricted to authenticated system administrators. The endpoint is
 * read-only and does not modify data.
 *
 * Authorization: Verifies the caller is an active system admin and that the
 * owning user account is active, verified, and not deleted.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system admin payload
 * @param props.kpiCounterId - UUID of the KPI counter window row to retrieve
 * @returns Detailed KPI window snapshot (ITodoAppKpiCounter)
 * @throws {HttpException} 403 when caller is not an active system admin
 * @throws {HttpException} 404 when the KPI snapshot is not found
 */
export async function gettodoAppSystemAdminKpiCountersKpiCounterId(props: {
  systemAdmin: SystemadminPayload;
  kpiCounterId: string & tags.Format<"uuid">;
}): Promise<ITodoAppKpiCounter> {
  const { systemAdmin, kpiCounterId } = props;

  // Authorization: ensure caller is an active system admin and user account valid
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
  if (membership === null) {
    throw new HttpException("Forbidden", 403);
  }

  // Fetch the KPI record by id
  const row = await MyGlobal.prisma.mv_todo_app_kpi_counters.findUnique({
    where: { id: kpiCounterId },
    select: {
      id: true,
      window_start: true,
      window_end: true,
      todos_created: true,
      todos_completed: true,
      active_users: true,
      avg_time_to_complete_hours: true,
      p95_completion_time_hours: true,
      refreshed_at: true,
      created_at: true,
      updated_at: true,
      deleted_at: true,
    },
  });

  if (row === null) {
    throw new HttpException("Not Found", 404);
  }

  // Map to API structure with proper branding and date conversions
  return {
    id: row.id as string & tags.Format<"uuid">,
    window_start: toISOStringSafe(row.window_start),
    window_end: toISOStringSafe(row.window_end),
    todos_created: row.todos_created as number & tags.Type<"int32">,
    todos_completed: row.todos_completed as number & tags.Type<"int32">,
    active_users: row.active_users as number & tags.Type<"int32">,
    avg_time_to_complete_hours: row.avg_time_to_complete_hours ?? null,
    p95_completion_time_hours: row.p95_completion_time_hours ?? null,
    refreshed_at: toISOStringSafe(row.refreshed_at),
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
    deleted_at: row.deleted_at ? toISOStringSafe(row.deleted_at) : null,
  };
}
