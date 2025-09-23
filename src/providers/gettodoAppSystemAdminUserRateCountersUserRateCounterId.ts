import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppUserRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserRateCounter";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Get user rate counter by ID (todo_app_user_rate_counters)
 *
 * Retrieves a single user-scoped rate counter window by its identifier. This
 * returns the associated rate limit policy reference, subject user reference,
 * counting window timestamps, the counter value, and any throttle block info.
 *
 * Security: Restricted to systemAdmin role. Also verifies the system admin
 * membership is currently active and the owning user account is active and
 * verified. Soft-deleted counter records (deleted_at != null) are not
 * returned.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator payload
 * @param props.userRateCounterId - UUID of the user rate counter window to
 *   retrieve
 * @returns Detailed user rate counter window entity
 * @throws {HttpException} 403 when the requester is not an active system admin
 * @throws {HttpException} 404 when the counter does not exist or is
 *   soft-deleted
 */
export async function gettodoAppSystemAdminUserRateCountersUserRateCounterId(props: {
  systemAdmin: SystemadminPayload;
  userRateCounterId: string & tags.Format<"uuid">;
}): Promise<ITodoAppUserRateCounter> {
  const { systemAdmin, userRateCounterId } = props;

  // Authorization: ensure active system admin membership and active, verified user
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

  // Fetch the counter; omit soft-deleted records
  const found = await MyGlobal.prisma.todo_app_user_rate_counters.findFirst({
    where: {
      id: userRateCounterId,
      deleted_at: null,
    },
    select: {
      id: true,
      todo_app_rate_limit_id: true,
      todo_app_user_id: true,
      window_started_at: true,
      window_ends_at: true,
      count: true,
      last_action_at: true,
      blocked_until: true,
      created_at: true,
      updated_at: true,
      deleted_at: true,
    },
  });

  if (!found) {
    throw new HttpException("Not Found", 404);
  }

  // Map to API structure with proper date conversions and brand types
  return {
    id: found.id as string & tags.Format<"uuid">,
    todo_app_rate_limit_id: found.todo_app_rate_limit_id as string &
      tags.Format<"uuid">,
    todo_app_user_id: found.todo_app_user_id as string & tags.Format<"uuid">,
    window_started_at: toISOStringSafe(found.window_started_at),
    window_ends_at: toISOStringSafe(found.window_ends_at),
    count: Number(found.count) as number & tags.Type<"int32">,
    last_action_at: found.last_action_at
      ? toISOStringSafe(found.last_action_at)
      : null,
    blocked_until: found.blocked_until
      ? toISOStringSafe(found.blocked_until)
      : null,
    created_at: toISOStringSafe(found.created_at),
    updated_at: toISOStringSafe(found.updated_at),
    deleted_at: found.deleted_at ? toISOStringSafe(found.deleted_at) : null,
  };
}
