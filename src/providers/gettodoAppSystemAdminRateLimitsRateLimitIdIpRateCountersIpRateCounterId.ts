import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppIpRateCounter } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppIpRateCounter";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Get an IP rate counter under a rate limit from todo_app_ip_rate_counters
 *
 * Retrieves a single IP-based rate counter scoped to the provided rate limit
 * policy. Ensures the counter belongs to the given rateLimitId and is not
 * soft-deleted (deleted_at is null). Only system administrators are authorized
 * to access this endpoint.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator payload
 * @param props.rateLimitId - UUID of the rate limit policy owning the counter
 * @param props.ipRateCounterId - UUID of the IP rate counter to retrieve
 * @returns The IP rate counter entity with window boundaries, counts, and audit
 *   timestamps
 * @throws {HttpException} 403 when the caller is not an active system
 *   administrator
 * @throws {HttpException} 404 when the counter is not found, soft-deleted, or
 *   not under the specified policy
 */
export async function gettodoAppSystemAdminRateLimitsRateLimitIdIpRateCountersIpRateCounterId(props: {
  systemAdmin: SystemadminPayload;
  rateLimitId: string & tags.Format<"uuid">;
  ipRateCounterId: string & tags.Format<"uuid">;
}): Promise<ITodoAppIpRateCounter> {
  const { systemAdmin, rateLimitId, ipRateCounterId } = props;

  // Authorization: verify active system admin membership and valid user state
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
    throw new HttpException(
      "Forbidden: Only active system administrators can access this resource",
      403,
    );
  }

  // Fetch the IP rate counter scoped to the provided rate limit and not soft-deleted
  const row = await MyGlobal.prisma.todo_app_ip_rate_counters.findFirst({
    where: {
      id: ipRateCounterId,
      todo_app_rate_limit_id: rateLimitId,
      deleted_at: null,
    },
    select: {
      id: true,
      todo_app_rate_limit_id: true,
      ip: true,
      window_started_at: true,
      window_ends_at: true,
      count: true,
      last_action_at: true,
      blocked_until: true,
      created_at: true,
      updated_at: true,
      // deleted_at intentionally not selected for normal responses
    },
  });

  if (row === null) {
    throw new HttpException("Not Found", 404);
  }

  // Map to API structure with proper ISO string conversions
  const output = {
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
    // deleted_at omitted (undefined) for active records
  };

  return typia.assert<ITodoAppIpRateCounter>(output);
}
