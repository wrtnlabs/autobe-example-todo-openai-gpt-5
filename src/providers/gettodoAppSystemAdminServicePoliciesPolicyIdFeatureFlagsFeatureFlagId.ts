import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppFeatureFlag } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppFeatureFlag";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Get a feature flag scoped to a service policy.
 *
 * Retrieves a single feature flag (todo_app_feature_flags) by its ID while
 * ensuring it belongs to the specified service policy
 * (todo_app_service_policies) via the todo_app_service_policy_id foreign key.
 * Soft-deleted records are excluded. Only accessible to authenticated system
 * administrators.
 *
 * Authorization: The caller must be an active System Admin. We verify an
 * active, non-revoked membership and the owning user's active/verified state.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated System Admin payload
 * @param props.policyId - UUID of the parent service policy
 * @param props.featureFlagId - UUID of the feature flag to retrieve
 * @returns Detailed feature flag information (ITodoAppFeatureFlag)
 * @throws {HttpException} 403 when the caller lacks active system admin rights
 * @throws {HttpException} 404 when the policy or feature flag is not found or
 *   not scoped to the policy
 */
export async function gettodoAppSystemAdminServicePoliciesPolicyIdFeatureFlagsFeatureFlagId(props: {
  systemAdmin: SystemadminPayload;
  policyId: string & tags.Format<"uuid">;
  featureFlagId: string & tags.Format<"uuid">;
}): Promise<ITodoAppFeatureFlag> {
  const { systemAdmin, policyId, featureFlagId } = props;

  // Authorization: ensure active system admin membership and healthy owning user
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
  if (!membership) {
    throw new HttpException(
      "Forbidden: Requires active system administrator membership",
      403,
    );
  }

  // Verify policy existence and not soft-deleted
  const policy = await MyGlobal.prisma.todo_app_service_policies.findFirst({
    where: { id: policyId, deleted_at: null },
    select: { id: true },
  });
  if (!policy) {
    throw new HttpException("Not Found", 404);
  }

  // Fetch the feature flag scoped to the policy and not soft-deleted
  const flag = await MyGlobal.prisma.todo_app_feature_flags.findFirst({
    where: {
      id: featureFlagId,
      todo_app_service_policy_id: policyId,
      deleted_at: null,
    },
  });
  if (!flag) {
    throw new HttpException("Not Found", 404);
  }

  // Build response with proper branding and date conversions
  const result: ITodoAppFeatureFlag = {
    id: typia.assert<string & tags.Format<"uuid">>(flag.id),
    todo_app_service_policy_id: typia.assert<string & tags.Format<"uuid">>(
      policyId,
    ),
    todo_app_user_id: flag.todo_app_user_id
      ? typia.assert<string & tags.Format<"uuid">>(flag.todo_app_user_id)
      : null,
    namespace: flag.namespace,
    environment: flag.environment ?? null,
    code: flag.code,
    name: flag.name,
    description: flag.description ?? null,
    active: flag.active,
    rollout_percentage: typia.assert<
      number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
    >(flag.rollout_percentage),
    target_audience: flag.target_audience ?? null,
    start_at: flag.start_at ? toISOStringSafe(flag.start_at) : null,
    end_at: flag.end_at ? toISOStringSafe(flag.end_at) : null,
    created_at: toISOStringSafe(flag.created_at),
    updated_at: toISOStringSafe(flag.updated_at),
    deleted_at: flag.deleted_at ? toISOStringSafe(flag.deleted_at) : null,
  };

  return result;
}
