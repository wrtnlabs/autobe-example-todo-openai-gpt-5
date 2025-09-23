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
 * Update a rate limit policy (todo_app_rate_limits) by ID
 *
 * Modifies throttling configuration fields such as name, description, scope,
 * category, window_seconds, max_requests, burst_size, sliding_window, enabled,
 * and optionally code (unique). Only available to authenticated system
 * administrators. Soft-deleted records cannot be updated.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator payload
 * @param props.rateLimitId - UUID of the rate limit policy to update
 * @param props.body - Partial update for mutable fields
 * @returns The updated rate limit policy
 * @throws {HttpException} 401/403 when unauthorized
 * @throws {HttpException} 404 when the policy does not exist or is deleted
 * @throws {HttpException} 409 when attempting to set a duplicate code
 * @throws {HttpException} 500 for unexpected errors
 */
export async function puttodoAppSystemAdminRateLimitsRateLimitId(props: {
  systemAdmin: SystemadminPayload;
  rateLimitId: string & tags.Format<"uuid">;
  body: ITodoAppRateLimit.IUpdate;
}): Promise<ITodoAppRateLimit> {
  const { systemAdmin, rateLimitId, body } = props;

  // Authorization: ensure caller is an active system admin and owning user is valid
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
  if (adminMembership === null)
    throw new HttpException(
      "Unauthorized: System administrator privileges required",
      403,
    );

  // Ensure target exists and is not soft-deleted
  const existing = await MyGlobal.prisma.todo_app_rate_limits.findFirst({
    where: { id: rateLimitId, deleted_at: null },
  });
  if (existing === null) throw new HttpException("Not Found", 404);

  // Update timestamp
  const now = toISOStringSafe(new Date());

  try {
    const updated = await MyGlobal.prisma.todo_app_rate_limits.update({
      where: { id: rateLimitId },
      data: {
        code: body.code ?? undefined,
        name: body.name ?? undefined,
        description:
          body.description === undefined ? undefined : body.description,
        scope: body.scope ?? undefined,
        category: body.category ?? undefined,
        window_seconds: body.window_seconds ?? undefined,
        max_requests: body.max_requests ?? undefined,
        burst_size: body.burst_size === undefined ? undefined : body.burst_size,
        sliding_window: body.sliding_window ?? undefined,
        enabled: body.enabled ?? undefined,
        updated_at: now,
      },
    });

    // Shape the response and convert date fields
    return typia.assert<ITodoAppRateLimit>({
      id: updated.id,
      code: updated.code,
      name: updated.name,
      description: updated.description === null ? null : updated.description,
      scope: updated.scope,
      category: updated.category,
      window_seconds: updated.window_seconds,
      max_requests: updated.max_requests,
      burst_size: updated.burst_size === null ? null : updated.burst_size,
      sliding_window: updated.sliding_window,
      enabled: updated.enabled,
      created_at: toISOStringSafe(updated.created_at),
      updated_at: now,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // Unique constraint violation (e.g., code uniqueness)
      if (err.code === "P2002")
        throw new HttpException("Conflict: code already exists", 409);
    }
    throw new HttpException("Internal Server Error", 500);
  }
}
