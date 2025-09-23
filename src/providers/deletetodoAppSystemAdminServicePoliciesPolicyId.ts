import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Delete a service policy (todo_app_service_policies) by id.
 *
 * Performs a logical deletion by setting deleted_at and deactivating the
 * policy. If the policy does not exist or is already deleted, responds with Not
 * Found. Operation is restricted to authenticated system administrators.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator payload
 * @param props.policyId - UUID of the policy to delete
 *   (todo_app_service_policies.id)
 * @returns Void on successful logical deletion
 * @throws {HttpException} 403 when caller is not a system admin
 * @throws {HttpException} 404 when policy is not found or already deleted
 */
export async function deletetodoAppSystemAdminServicePoliciesPolicyId(props: {
  systemAdmin: SystemadminPayload;
  policyId: string & tags.Format<"uuid">;
}): Promise<void> {
  const { systemAdmin, policyId } = props;

  // Authorization: ensure caller is a system administrator
  if (!systemAdmin || systemAdmin.type !== "systemadmin") {
    throw new HttpException("Forbidden", 403);
  }

  // Ensure target exists and is not already soft-deleted
  const existing = await MyGlobal.prisma.todo_app_service_policies.findFirst({
    where: {
      id: policyId,
      deleted_at: null,
    },
  });
  if (!existing) {
    throw new HttpException("Not Found", 404);
  }

  // Soft delete: set deleted_at, deactivate, and bump updated_at
  const now = toISOStringSafe(new Date());
  await MyGlobal.prisma.todo_app_service_policies.update({
    where: { id: policyId },
    data: {
      deleted_at: now,
      active: false,
      updated_at: now,
    },
  });

  // No content on success
  return undefined;
}
