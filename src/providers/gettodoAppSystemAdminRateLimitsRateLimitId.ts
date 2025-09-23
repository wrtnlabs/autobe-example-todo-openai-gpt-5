import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppRateLimit } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppRateLimit";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Get a specific rate limit policy (todo_app_rate_limits) by ID
 *
 * Retrieves one rate limit policy for system administrators to review exact
 * throttling configuration values. Applies authorization to ensure the caller
 * is an active system administrator and excludes logically deleted records.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated System Admin payload
 * @param props.rateLimitId - UUID of the rate limit policy to retrieve
 * @returns Full rate limit policy configuration object
 * @throws {HttpException} 403 When the requester is not an active system admin
 * @throws {HttpException} 404 When the policy is not found or is deleted
 */
export async function gettodoAppSystemAdminRateLimitsRateLimitId(props: {
  systemAdmin: SystemadminPayload;
  rateLimitId: string & tags.Format<"uuid">;
}): Promise<ITodoAppRateLimit> {
  const { systemAdmin, rateLimitId } = props;

  // Authorization: verify active system admin membership and user state
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

  const record = await MyGlobal.prisma.todo_app_rate_limits.findFirst({
    where: { id: rateLimitId, deleted_at: null },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      scope: true,
      category: true,
      window_seconds: true,
      max_requests: true,
      burst_size: true,
      sliding_window: true,
      enabled: true,
      created_at: true,
      updated_at: true,
    },
  });
  if (!record) throw new HttpException("Not Found", 404);

  return {
    id: record.id as string & tags.Format<"uuid">,
    code: record.code,
    name: record.name,
    description: record.description ?? null,
    scope: record.scope as ERateLimitScope,
    category: record.category as ERateLimitCategory,
    window_seconds: record.window_seconds as number & tags.Type<"int32">,
    max_requests: record.max_requests as number & tags.Type<"int32">,
    burst_size:
      record.burst_size === null
        ? null
        : (record.burst_size as number & tags.Type<"int32">),
    sliding_window: record.sliding_window,
    enabled: record.enabled,
    created_at: toISOStringSafe(record.created_at),
    updated_at: toISOStringSafe(record.updated_at),
  };
}
