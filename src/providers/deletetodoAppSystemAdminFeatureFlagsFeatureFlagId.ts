import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Delete a feature flag (todo_app_feature_flags) by ID
 *
 * Removes a feature flag from active evaluation by marking it as logically
 * deleted. This operation sets the deleted_at timestamp so the flag is excluded
 * from standard listings and runtime evaluators. Only systemAdmin actors are
 * authorized. An administrative action record is captured for auditability.
 *
 * Behavior:
 *
 * - 404 Not Found when the id does not correspond to an existing record
 * - Idempotent: if already deleted, operation succeeds without further changes
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system admin performing the
 *   deletion
 * @param props.featureFlagId - UUID of the feature flag to delete
 * @returns Void
 * @throws {HttpException} 403 when the caller is not an active system admin
 * @throws {HttpException} 404 when the feature flag does not exist
 */
export async function deletetodoAppSystemAdminFeatureFlagsFeatureFlagId(props: {
  systemAdmin: SystemadminPayload;
  featureFlagId: string & tags.Format<"uuid">;
}): Promise<void> {
  const { systemAdmin, featureFlagId } = props;

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
      select: { id: true },
    },
  );
  if (!adminMembership) {
    throw new HttpException(
      "Forbidden: Only system admins can delete feature flags",
      403,
    );
  }

  // Load the feature flag by id
  const existing = await MyGlobal.prisma.todo_app_feature_flags.findUnique({
    where: { id: featureFlagId },
    select: { id: true, deleted_at: true },
  });
  if (!existing) {
    throw new HttpException("Not Found: Feature flag does not exist", 404);
  }

  const now = toISOStringSafe(new Date());

  // If already deleted, treat as idempotent success (still record admin action)
  if (existing.deleted_at !== null) {
    await MyGlobal.prisma.todo_app_admin_actions.create({
      data: {
        id: v4(),
        admin_user_id: systemAdmin.id,
        target_user_id: null,
        action: "delete_feature_flag",
        reason: null,
        notes: `Idempotent delete for featureFlagId=${featureFlagId}`,
        success: true,
        idempotency_key: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    });
    return;
  }

  // Soft delete the feature flag
  await MyGlobal.prisma.todo_app_feature_flags.update({
    where: { id: featureFlagId },
    data: {
      deleted_at: now,
      updated_at: now,
    },
  });

  // Record administrative action
  await MyGlobal.prisma.todo_app_admin_actions.create({
    data: {
      id: v4(),
      admin_user_id: systemAdmin.id,
      target_user_id: null,
      action: "delete_feature_flag",
      reason: null,
      notes: `Deleted featureFlagId=${featureFlagId}`,
      success: true,
      idempotency_key: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
  });
}
