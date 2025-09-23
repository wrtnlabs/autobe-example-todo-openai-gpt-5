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
 * Get a service configuration (todo_app_service_configurations) by id under a
 * policy
 *
 * Retrieves a single service configuration by its UUID, enforcing that it
 * belongs to the specified parent policy (policyId) and is not soft-deleted.
 * Returns full details for administrative inspection.
 *
 * Security: Only accessible by authenticated System Admins. This function
 * verifies active, non-revoked system admin membership and that the owning user
 * account is active, verified, and not deleted.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator payload
 * @param props.policyId - UUID of the parent service policy
 * @param props.configurationId - UUID of the target configuration
 * @returns The detailed service configuration record
 * @throws {HttpException} 403 when caller lacks system admin privileges
 * @throws {HttpException} 404 when configuration not found, outside the given
 *   policy, or soft-deleted
 */
export async function gettodoAppSystemAdminServicePoliciesPolicyIdServiceConfigurationsConfigurationId(props: {
  systemAdmin: SystemadminPayload;
  policyId: string & tags.Format<"uuid">;
  configurationId: string & tags.Format<"uuid">;
}): Promise<ITodoAppServiceConfiguration> {
  const { systemAdmin, policyId, configurationId } = props;

  // Authorization: verify active system admin membership and healthy user
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

  // Retrieve configuration scoped under policy and excluding soft-deleted rows
  const row = await MyGlobal.prisma.todo_app_service_configurations.findFirst({
    where: {
      id: configurationId,
      todo_app_service_policy_id: policyId,
      deleted_at: null,
      policy: {
        id: policyId,
        deleted_at: null,
      },
    },
    select: {
      id: true,
      todo_app_user_id: true,
      todo_app_service_policy_id: true,
      namespace: true,
      environment: true,
      key: true,
      value: true,
      value_type: true,
      is_secret: true,
      description: true,
      active: true,
      effective_from: true,
      effective_to: true,
      created_at: true,
      updated_at: true,
      deleted_at: true,
    },
  });

  if (!row) throw new HttpException("Not Found", 404);

  return {
    id: row.id as string & tags.Format<"uuid">,
    todo_app_user_id:
      row.todo_app_user_id === null
        ? null
        : (row.todo_app_user_id as string & tags.Format<"uuid">),
    todo_app_service_policy_id:
      row.todo_app_service_policy_id === null
        ? null
        : (row.todo_app_service_policy_id as string & tags.Format<"uuid">),
    namespace: row.namespace,
    environment: row.environment ?? null,
    key: row.key,
    value: row.value,
    value_type: row.value_type as EConfigValueType,
    is_secret: row.is_secret,
    description: row.description ?? null,
    active: row.active,
    effective_from: row.effective_from
      ? toISOStringSafe(row.effective_from)
      : null,
    effective_to: row.effective_to ? toISOStringSafe(row.effective_to) : null,
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
    deleted_at: row.deleted_at ? toISOStringSafe(row.deleted_at) : null,
  };
}
