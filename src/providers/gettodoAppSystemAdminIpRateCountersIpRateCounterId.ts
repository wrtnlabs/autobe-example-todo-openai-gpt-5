import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppIpRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppIpRateCounter";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

export async function gettodoAppSystemAdminIpRateCountersIpRateCounterId(props: {
  systemAdmin: SystemadminPayload;
  ipRateCounterId: string & tags.Format<"uuid">;
}): Promise<ITodoAppIpRateCounter> {
  /**
   * Get a single IP rate counter (todo_app_ip_rate_counters) by ID.
   *
   * Retrieves administrative diagnostics for one IP-scoped rate counter,
   * including active window boundaries, counts, last action time, and any
   * throttle block. Records with deleted_at set are excluded.
   *
   * Authorization: systemAdmin only. Verifies active, non-revoked membership
   * and owning user account state.
   *
   * @param props - Request properties
   * @param props.systemAdmin - Authenticated system administrator payload
   * @param props.ipRateCounterId - UUID of the IP rate counter to retrieve
   * @returns Detailed IP rate counter DTO
   * @throws {HttpException} 403 when caller is not an active system admin
   * @throws {HttpException} 404 when the counter is not found (or soft-deleted)
   */
  const { systemAdmin, ipRateCounterId } = props;

  // Authorization: ensure payload role and active membership
  if (!systemAdmin || systemAdmin.type !== "systemadmin")
    throw new HttpException("Forbidden", 403);

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
  if (membership === null) throw new HttpException("Forbidden", 403);

  // Fetch the IP rate counter, excluding soft-deleted rows
  const row = await MyGlobal.prisma.todo_app_ip_rate_counters.findFirst({
    where: {
      id: ipRateCounterId,
      deleted_at: null,
    },
  });
  if (row === null) throw new HttpException("Not Found", 404);

  // Map to DTO with proper ISO date handling; include nullable optionals as null
  const output = typia.assert<ITodoAppIpRateCounter>({
    id: row.id,
    todo_app_rate_limit_id: row.todo_app_rate_limit_id,
    ip: row.ip,
    window_started_at: toISOStringSafe(row.window_started_at),
    window_ends_at: toISOStringSafe(row.window_ends_at),
    count: row.count,
    last_action_at: row.last_action_at
      ? toISOStringSafe(row.last_action_at)
      : null,
    blocked_until: row.blocked_until
      ? toISOStringSafe(row.blocked_until)
      : null,
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
    deleted_at: row.deleted_at ? toISOStringSafe(row.deleted_at) : null,
  });

  return output;
}
