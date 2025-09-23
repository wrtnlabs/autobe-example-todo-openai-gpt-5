import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Soft-remove a feature flag under a specific service policy.
 *
 * This operation sets deleted_at on todo_app_feature_flags to mark the record
 * as removed while preserving history. It verifies that the requesting actor is
 * a valid System Administrator and that the target feature flag belongs to the
 * specified service policy.
 *
 * Behavior:
 *
 * - Authorization: Only active, verified system admins can perform this action
 * - Scope check: The feature flag must belong to the given policyId
 * - Idempotent: If the flag is already removed (deleted_at not null), succeed
 *   silently
 * - Soft delete: Set deleted_at and updated_at to current time; no hard delete
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated System Administrator payload
 * @param props.policyId - UUID of the parent service policy
 * @param props.featureFlagId - UUID of the feature flag to soft-delete
 * @returns Void
 * @throws {HttpException} 403 when the actor is not an active system admin
 * @throws {HttpException} 404 when the feature flag does not exist or does not
 *   belong to the policy
 */
export async function deletetodoAppSystemAdminServicePoliciesPolicyIdFeatureFlagsFeatureFlagId(props: {
  systemAdmin: SystemadminPayload;
  policyId: string & tags.Format<"uuid">;
  featureFlagId: string & tags.Format<"uuid">;
}): Promise<void> {
  const { systemAdmin, policyId, featureFlagId } = props;

  // Authorization: validate active system admin membership and owning user state
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

  // Fetch by primary key and verify policy scope
  const flag = await MyGlobal.prisma.todo_app_feature_flags.findUnique({
    where: { id: featureFlagId },
  });
  if (!flag || flag.todo_app_service_policy_id !== policyId) {
    throw new HttpException("Not Found", 404);
  }

  // Idempotent behavior: already soft-deleted → succeed silently
  if (flag.deleted_at !== null) return;

  // Perform soft delete by setting deleted_at and updating updated_at
  const now = toISOStringSafe(new Date());
  await MyGlobal.prisma.todo_app_feature_flags.update({
    where: { id: featureFlagId },
    data: {
      deleted_at: now,
      updated_at: now,
    },
  });
}
