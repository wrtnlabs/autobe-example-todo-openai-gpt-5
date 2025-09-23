import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Get a specific service policy (todo_app_service_policies) by ID
 *
 * Retrieves a single service policy by its UUID identifier for system
 * administrators. Enforces authorization by verifying the caller has an active,
 * non-revoked system admin membership and that their user account is active and
 * email-verified. Excludes soft-deleted policies (deleted_at not null).
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator payload
 * @param props.policyId - UUID of the policy to retrieve
 * @returns The complete service policy object
 * @throws {HttpException} Forbidden (403) when the caller lacks active admin
 *   membership
 * @throws {HttpException} Not Found (404) when the policy does not exist or is
 *   archived
 */
export async function gettodoAppSystemAdminServicePoliciesPolicyId(props: {
  systemAdmin: SystemadminPayload;
  policyId: string & tags.Format<"uuid">;
}): Promise<ITodoAppServicePolicy> {
  const { systemAdmin, policyId } = props;

  // Authorization: ensure caller has active system admin membership
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
    throw new HttpException("Forbidden", 403);
  }

  // Fetch the policy; exclude archived (soft-deleted) records
  const policy = await MyGlobal.prisma.todo_app_service_policies.findFirst({
    where: {
      id: policyId,
      deleted_at: null,
    },
  });
  if (!policy) {
    throw new HttpException("Not Found", 404);
  }

  return {
    id: typia.assert<string & tags.Format<"uuid">>(policy.id),
    todo_app_user_id:
      policy.todo_app_user_id === null
        ? null
        : typia.assert<string & tags.Format<"uuid">>(policy.todo_app_user_id),
    namespace: policy.namespace,
    code: policy.code,
    name: policy.name,
    description: policy.description ?? null,
    value: policy.value,
    value_type: policy.value_type,
    active: policy.active,
    effective_from: policy.effective_from
      ? toISOStringSafe(policy.effective_from)
      : null,
    effective_to: policy.effective_to
      ? toISOStringSafe(policy.effective_to)
      : null,
    created_at: toISOStringSafe(policy.created_at),
    updated_at: toISOStringSafe(policy.updated_at),
    deleted_at: policy.deleted_at ? toISOStringSafe(policy.deleted_at) : null,
  };
}
