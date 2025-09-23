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
 * Get a single user rate counter (todo_app_user_rate_counters) under a specific
 * rate limit.
 *
 * Retrieves an operational counter window for a user scoped to the provided
 * rate limit policy. Ensures the caller is a valid system administrator and
 * enforces policy scoping by requiring the counter's todo_app_rate_limit_id to
 * match the path rateLimitId. Soft-deleted records are excluded. This is a
 * read-only operation with no side effects.
 *
 * @param props - Request properties
 * @param props.systemAdmin - Authenticated system administrator payload
 * @param props.rateLimitId - Parent rate limit policy ID (UUID) used to scope
 *   the counter
 * @param props.userRateCounterId - Target user rate counter ID (UUID)
 * @returns Detailed user rate counter including window, counts, and block
 *   status
 * @throws {HttpException} 403 - When caller is not an active system
 *   administrator
 * @throws {HttpException} 404 - When the counter does not exist, is
 *   soft-deleted, or does not belong to the provided rate limit
 */
export async function gettodoAppSystemAdminRateLimitsRateLimitIdUserRateCountersUserRateCounterId(props: {
  systemAdmin: SystemadminPayload;
  rateLimitId: string & tags.Format<"uuid">;
  userRateCounterId: string & tags.Format<"uuid">;
}): Promise<ITodoAppUserRateCounter> {
  const { systemAdmin, rateLimitId, userRateCounterId } = props;

  // Authorization: ensure caller is an active system administrator
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
  if (!membership) throw new HttpException("Forbidden", 403);

  // Fetch the user rate counter scoped under the provided rate limit
  const counter = await MyGlobal.prisma.todo_app_user_rate_counters.findFirst({
    where: {
      id: userRateCounterId,
      todo_app_rate_limit_id: rateLimitId,
      deleted_at: null,
    },
  });
  if (!counter) throw new HttpException("Not Found", 404);

  // Build response with proper Date -> ISO string conversions
  const result = {
    id: counter.id,
    todo_app_rate_limit_id: counter.todo_app_rate_limit_id,
    todo_app_user_id: counter.todo_app_user_id,
    window_started_at: toISOStringSafe(counter.window_started_at),
    window_ends_at: toISOStringSafe(counter.window_ends_at),
    count: counter.count,
    last_action_at: counter.last_action_at
      ? toISOStringSafe(counter.last_action_at)
      : null,
    blocked_until: counter.blocked_until
      ? toISOStringSafe(counter.blocked_until)
      : null,
    created_at: toISOStringSafe(counter.created_at),
    updated_at: toISOStringSafe(counter.updated_at),
    deleted_at: counter.deleted_at ? toISOStringSafe(counter.deleted_at) : null,
  };

  return typia.assert<ITodoAppUserRateCounter>(result);
}
