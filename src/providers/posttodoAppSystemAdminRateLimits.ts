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
 * Create a rate limit policy in todo_app_rate_limits.
 *
 * Inserts a new throttling policy record with a unique business code, scope,
 * category, window and limit settings. Only active, verified system
 * administrators may perform this operation. Soft-deleted records are ignored
 * for authorization checks. On success, returns the created policy.
 *
 * @param props - Request properties
 * @param props.systemAdmin - Authenticated system administrator payload
 * @param props.body - New rate limit policy configuration
 * @returns The newly created ITodoAppRateLimit entity
 * @throws {HttpException} 401/403 when unauthorized
 * @throws {HttpException} 409 when a policy with the same code already exists
 * @throws {HttpException} 500 for unexpected errors
 */
export async function posttodoAppSystemAdminRateLimits(props: {
  systemAdmin: SystemadminPayload;
  body: ITodoAppRateLimit.ICreate;
}): Promise<ITodoAppRateLimit> {
  const { systemAdmin, body } = props;

  // Authorization: ensure the caller is an active, verified system admin
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
  if (!membership) {
    throw new HttpException(
      "Unauthorized: Only active system administrators can create rate limit policies",
      403,
    );
  }

  // Uniqueness pre-check for business code (defensive; also handle race via catch)
  const existing = await MyGlobal.prisma.todo_app_rate_limits.findFirst({
    where: { code: body.code },
    select: { id: true },
  });
  if (existing) {
    throw new HttpException(
      "Conflict: A rate limit policy with the same code already exists",
      409,
    );
  }

  // Prepare identifiers and timestamps
  const id = v4() as string & tags.Format<"uuid">;
  const now = toISOStringSafe(new Date());

  try {
    // Create policy
    await MyGlobal.prisma.todo_app_rate_limits.create({
      data: {
        id,
        code: body.code,
        name: body.name,
        description: body.description ?? null,
        scope: body.scope,
        category: body.category,
        window_seconds: body.window_seconds,
        max_requests: body.max_requests,
        burst_size: body.burst_size ?? null,
        sliding_window: body.sliding_window,
        enabled: body.enabled,
        created_at: now,
        updated_at: now,
        // deleted_at intentionally omitted (defaults to NULL)
      },
    });

    // Use prepared values to avoid nullable Date conversions from Prisma
    const result: ITodoAppRateLimit = {
      id,
      code: body.code,
      name: body.name,
      description: body.description ?? null,
      scope: body.scope,
      category: body.category,
      window_seconds: body.window_seconds,
      max_requests: body.max_requests,
      burst_size: body.burst_size ?? null,
      sliding_window: body.sliding_window,
      enabled: body.enabled,
      created_at: now,
      updated_at: now,
    };
    return result;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // Unique constraint violation (e.g., code)
      if (err.code === "P2002") {
        throw new HttpException(
          "Conflict: A rate limit policy with the same code already exists",
          409,
        );
      }
    }
    throw new HttpException("Internal Server Error", 500);
  }
}
