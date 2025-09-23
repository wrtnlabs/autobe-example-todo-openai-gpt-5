import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Delete a service configuration by ID (logical deletion via deleted_at).
 *
 * Marks the todo_app_service_configurations record as archived by setting
 * deleted_at (soft delete). Operation is idempotent: if the record does not
 * exist or is already deleted, it succeeds without error. Also updates
 * updated_at and attributes the action to the acting system admin.
 *
 * Authorization: system administrators only. Verifies active, non-revoked
 * system admin membership and that the owning user account is active, verified,
 * and not deleted.
 *
 * @param props - Request properties
 * @param props.systemAdmin - Authenticated system administrator payload
 * @param props.configurationId - UUID of the configuration to delete
 * @returns Void
 * @throws {HttpException} 403 when the caller lacks system admin privileges
 */
export async function deletetodoAppSystemAdminServiceConfigurationsConfigurationId(props: {
  systemAdmin: SystemadminPayload;
  configurationId: string & tags.Format<"uuid">;
}): Promise<void> {
  const { systemAdmin, configurationId } = props;

  // Authorization: ensure valid, active system admin membership
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
  if (membership === null) {
    throw new HttpException(
      "Unauthorized: System administrator privileges required",
      403,
    );
  }

  // Fetch existing configuration; idempotent behavior on absence
  const existing =
    await MyGlobal.prisma.todo_app_service_configurations.findUnique({
      where: { id: configurationId },
      select: { id: true, deleted_at: true },
    });
  if (existing === null) return; // idempotent
  if (existing.deleted_at !== null) return; // already soft-deleted

  // Perform soft delete
  const now = toISOStringSafe(new Date());
  await MyGlobal.prisma.todo_app_service_configurations.update({
    where: { id: configurationId },
    data: {
      deleted_at: now,
      updated_at: now,
      // Attribute last updater to the acting admin's user id
      todo_app_user_id: systemAdmin.id,
    },
  });
}
