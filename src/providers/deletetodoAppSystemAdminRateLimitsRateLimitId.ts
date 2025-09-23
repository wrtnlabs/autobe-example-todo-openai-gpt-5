import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Retire a rate limit policy (todo_app_rate_limits) by ID.
 *
 * Performs a governance-safe logical deletion by setting deleted_at while
 * preserving historical references from user/IP counters. Operation requires
 * system administrator authorization and enforces the business precondition
 * that enforcement be disabled (enabled=false) before retirement. The operation
 * is idempotent; if the policy is already retired, it returns successfully
 * without further changes.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator payload
 * @param props.rateLimitId - UUID of the rate limit policy to retire
 * @returns Void
 * @throws {HttpException} 403 - When the actor is not a current system admin
 * @throws {HttpException} 404 - When the policy does not exist
 * @throws {HttpException} 409 - When the policy remains enabled (must disable
 *   first)
 */
export async function deletetodoAppSystemAdminRateLimitsRateLimitId(props: {
  systemAdmin: SystemadminPayload;
  rateLimitId: string & tags.Format<"uuid">;
}): Promise<void> {
  const { systemAdmin, rateLimitId } = props;

  // Authorization: verify current, active system admin membership and owning user state
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
      "Forbidden: Not a current system administrator",
      403,
    );
  }

  // Retrieve the policy (by unique id)
  const policy = await MyGlobal.prisma.todo_app_rate_limits.findUnique({
    where: { id: rateLimitId },
  });
  if (policy === null) {
    throw new HttpException("Not Found: Rate limit policy does not exist", 404);
  }

  // Idempotency: already retired
  if (policy.deleted_at !== null) return;

  // Precondition: must be disabled prior to retirement
  if (policy.enabled === true) {
    throw new HttpException(
      "Conflict: Disable the policy (enabled=false) before retirement",
      409,
    );
  }

  // Soft delete with timestamp updates
  const now = toISOStringSafe(new Date());
  await MyGlobal.prisma.todo_app_rate_limits.update({
    where: { id: rateLimitId },
    data: {
      deleted_at: now,
      updated_at: now,
    },
  });
}
