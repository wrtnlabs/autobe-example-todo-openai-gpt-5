import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppEventCountersDaily } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEventCountersDaily";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Get one daily event counter (todo_app_event_counters_daily) by ID
 *
 * Retrieves a single snapshot row from todo_app_event_counters_daily by its
 * primary key. Returns dimensions (event type and optional user/todo),
 * bucket_date, count, and audit timestamps. Access is restricted to system
 * administrators.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated System Admin making the request
 * @param props.eventCounterDailyId - UUID of the daily event counter row to
 *   retrieve
 * @returns The detailed daily event counter entity
 * @throws {HttpException} Forbidden (403) if caller is not an active system
 *   admin
 * @throws {HttpException} Not Found (404) if the row does not exist
 */
export async function gettodoAppSystemAdminEventCountersDailyEventCounterDailyId(props: {
  systemAdmin: SystemadminPayload;
  eventCounterDailyId: string & tags.Format<"uuid">;
}): Promise<ITodoAppEventCountersDaily> {
  const { systemAdmin, eventCounterDailyId } = props;

  // Authorization: ensure caller is an active, non-revoked system admin and user is active/verified
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

  // Fetch the counter row by primary key
  const row = await MyGlobal.prisma.todo_app_event_counters_daily.findUnique({
    where: { id: eventCounterDailyId },
  });
  if (!row) throw new HttpException("Not Found", 404);

  // Map Prisma result to API DTO with proper date conversions and optional nullable UUIDs
  const result: ITodoAppEventCountersDaily = {
    id: row.id as string & tags.Format<"uuid">,
    todo_app_event_type_id: row.todo_app_event_type_id as string &
      tags.Format<"uuid">,
    todo_app_user_id:
      row.todo_app_user_id === null
        ? null
        : (row.todo_app_user_id as string & tags.Format<"uuid">),
    todo_app_todo_id:
      row.todo_app_todo_id === null
        ? null
        : (row.todo_app_todo_id as string & tags.Format<"uuid">),
    bucket_date: toISOStringSafe(row.bucket_date),
    count: row.count as number & tags.Type<"int32"> & tags.Minimum<0>,
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
  };

  return result;
}
