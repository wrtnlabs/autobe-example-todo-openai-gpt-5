import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppDailyStat } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppDailyStat";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Get details of a single daily stat (mv_todo_app_daily_stats) by ID.
 *
 * Retrieves one row from the materialized view mv_todo_app_daily_stats using
 * its primary key. Access is restricted to system administrators. Soft-deleted
 * rows (deleted_at not null) are treated as not found.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator payload
 * @param props.dailyStatId - UUID of the daily statistics row to fetch
 * @returns The full ITodoAppDailyStat record for administrative inspection
 * @throws {HttpException} 403 when the caller is not an active system admin
 * @throws {HttpException} 404 when the requested row does not exist or is
 *   deleted
 */
export async function gettodoAppSystemAdminDailyStatsDailyStatId(props: {
  systemAdmin: SystemadminPayload;
  dailyStatId: string & tags.Format<"uuid">;
}): Promise<ITodoAppDailyStat> {
  const { systemAdmin, dailyStatId } = props;

  // Authorization: ensure caller is an active system admin with valid user state
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
    throw new HttpException("Forbidden", 403);
  }

  // Fetch the MV row by id; exclude soft-deleted
  const row = await MyGlobal.prisma.mv_todo_app_daily_stats.findFirst({
    where: {
      id: dailyStatId,
      deleted_at: null,
    },
  });
  if (row === null) {
    throw new HttpException("Not Found", 404);
  }

  // Map to API structure with proper date conversions and branding
  return {
    id: row.id as string & tags.Format<"uuid">,
    stats_date: toISOStringSafe(row.stats_date),
    todos_created: row.todos_created as number & tags.Type<"int32">,
    todos_completed: row.todos_completed as number & tags.Type<"int32">,
    active_users: row.active_users as number & tags.Type<"int32">,
    completion_ratio: row.completion_ratio,
    refreshed_at: toISOStringSafe(row.refreshed_at),
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
    deleted_at: row.deleted_at ? toISOStringSafe(row.deleted_at) : null,
  };
}
