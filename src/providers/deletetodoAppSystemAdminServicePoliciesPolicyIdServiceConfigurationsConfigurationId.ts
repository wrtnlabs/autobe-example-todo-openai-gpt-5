import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Remove a configuration (todo_app_service_configurations) from active use by
 * marking deleted_at.
 *
 * Marks the target configuration as soft-deleted within the specified policy
 * scope. This operation is idempotent: if the configuration is already deleted,
 * it succeeds without changes. Authorization: restricted to active system
 * administrators.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator performing
 *   the operation
 * @param props.policyId - UUID of the parent policy owning the configuration
 * @param props.configurationId - UUID of the configuration to soft-delete
 * @returns Void
 * @throws {HttpException} 403 When the caller lacks system administrator
 *   privileges
 * @throws {HttpException} 404 When no configuration exists under the given
 *   policy with the specified ID
 */
export async function deletetodoAppSystemAdminServicePoliciesPolicyIdServiceConfigurationsConfigurationId(props: {
  systemAdmin: SystemadminPayload;
  policyId: string & tags.Format<"uuid">;
  configurationId: string & tags.Format<"uuid">;
}): Promise<void> {
  const { systemAdmin, policyId, configurationId } = props;

  // Authorization: ensure active, non-revoked system admin membership and valid owning user state
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
  if (!membership)
    throw new HttpException(
      "Unauthorized: Only active system administrators can delete configurations",
      403,
    );

  // Locate configuration within the specified policy scope
  const target =
    await MyGlobal.prisma.todo_app_service_configurations.findFirst({
      where: {
        id: configurationId,
        todo_app_service_policy_id: policyId,
      },
    });
  if (!target) throw new HttpException("Not Found", 404);

  // Idempotent behavior: already deleted → succeed without changes
  if (target.deleted_at !== null) return;

  const now = toISOStringSafe(new Date());

  // Soft delete: mark deleted_at, disable active flag, stamp updated_at, attribute actor
  await MyGlobal.prisma.todo_app_service_configurations.update({
    where: { id: configurationId },
    data: {
      deleted_at: now,
      updated_at: now,
      active: false,
      todo_app_user_id: systemAdmin.id,
    },
  });
}
