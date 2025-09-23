import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppServiceConfiguration } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServiceConfiguration";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Get one service configuration by id (todo_app_service_configurations)
 *
 * Retrieves a single configuration record by its UUID for system
 * administrators. Records with non-null deleted_at are excluded from normal
 * reads. Returns full detail including sensitive value when is_secret=true,
 * suitable for administrative review and auditing contexts.
 *
 * Authorization: Requires an active system administrator. Verifies that the
 * provided systemAdmin payload corresponds to a current, non-revoked
 * system-admin membership and that the owning user account is active and
 * email-verified.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated System Administrator payload
 * @param props.configurationId - Target configuration's UUID
 * @returns Detailed configuration record mapped to API structure
 * @throws {HttpException} 403 when the caller is not an active system
 *   administrator
 * @throws {HttpException} 404 when the configuration does not exist or is
 *   soft-deleted
 */
export async function gettodoAppSystemAdminServiceConfigurationsConfigurationId(props: {
  systemAdmin: SystemadminPayload;
  configurationId: string & tags.Format<"uuid">;
}): Promise<ITodoAppServiceConfiguration> {
  const { systemAdmin, configurationId } = props;

  // Authorization - ensure active system admin membership and valid owning user state
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
      "Unauthorized: Only active system administrators can access this resource",
      403,
    );
  }

  // Fetch configuration by id, excluding soft-deleted
  const record =
    await MyGlobal.prisma.todo_app_service_configurations.findFirst({
      where: {
        id: configurationId,
        deleted_at: null,
      },
    });
  if (record === null) {
    throw new HttpException("Not Found", 404);
  }

  // Map DB entity to API structure with proper date-time conversions and null handling
  return {
    id: record.id as string & tags.Format<"uuid">,
    todo_app_user_id:
      record.todo_app_user_id === null
        ? null
        : (record.todo_app_user_id as string & tags.Format<"uuid">),
    todo_app_service_policy_id:
      record.todo_app_service_policy_id === null
        ? null
        : (record.todo_app_service_policy_id as string & tags.Format<"uuid">),
    namespace: record.namespace,
    environment: record.environment ?? null,
    key: record.key,
    value: record.value,
    value_type: record.value_type as EConfigValueType,
    is_secret: record.is_secret,
    description: record.description ?? null,
    active: record.active,
    effective_from: record.effective_from
      ? toISOStringSafe(record.effective_from)
      : null,
    effective_to: record.effective_to
      ? toISOStringSafe(record.effective_to)
      : null,
    created_at: toISOStringSafe(record.created_at),
    updated_at: toISOStringSafe(record.updated_at),
    deleted_at: record.deleted_at ? toISOStringSafe(record.deleted_at) : null,
  };
}
