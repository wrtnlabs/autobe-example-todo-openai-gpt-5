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
 * Get a single feature flag by ID from todo_app_feature_flags.
 *
 * Retrieves full details for a feature flag, including administrative fields,
 * rollout configuration, optional governance policy linkage, and lifecycle
 * timestamps. Only system administrators may access this endpoint. Soft-deleted
 * records are not returned.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator payload
 * @param props.featureFlagId - UUID of the feature flag to retrieve
 * @returns The complete ITodoAppFeatureFlag entity
 * @throws {HttpException} 403 when the caller is not an active system admin
 * @throws {HttpException} 404 when the feature flag does not exist or is
 *   archived
 */
export async function gettodoAppSystemAdminFeatureFlagsFeatureFlagId(props: {
  systemAdmin: SystemadminPayload;
  featureFlagId: string & tags.Format<"uuid">;
}): Promise<ITodoAppFeatureFlag> {
  // Authorization: ensure caller is an active system admin with valid owning user
  const membership = await MyGlobal.prisma.todo_app_systemadmins.findFirst({
    where: {
      todo_app_user_id: props.systemAdmin.id,
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
    throw new HttpException("Forbidden: system admin privileges required", 403);
  }

  // Fetch the feature flag, excluding soft-deleted
  const row = await MyGlobal.prisma.todo_app_feature_flags.findFirst({
    where: {
      id: props.featureFlagId,
      deleted_at: null,
    },
  });
  if (!row) {
    throw new HttpException("Not Found: feature flag does not exist", 404);
  }

  // Normalize optional UUIDs and branded numeric via typia.assert without using assertions
  const policyId =
    row.todo_app_service_policy_id === null
      ? null
      : typia.assert<string & tags.Format<"uuid">>(
          row.todo_app_service_policy_id,
        );
  const ownerUserId =
    row.todo_app_user_id === null
      ? null
      : typia.assert<string & tags.Format<"uuid">>(row.todo_app_user_id);
  const rollout = typia.assert<
    number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
  >(row.rollout_percentage);

  // Build response with proper date-time conversions and null handling
  const result: ITodoAppFeatureFlag = {
    id: props.featureFlagId,
    todo_app_service_policy_id: policyId,
    todo_app_user_id: ownerUserId,
    namespace: row.namespace,
    environment: row.environment ?? null,
    code: row.code,
    name: row.name,
    description: row.description ?? null,
    active: row.active,
    rollout_percentage: rollout,
    target_audience: row.target_audience ?? null,
    start_at: row.start_at ? toISOStringSafe(row.start_at) : null,
    end_at: row.end_at ? toISOStringSafe(row.end_at) : null,
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
    deleted_at: row.deleted_at ? toISOStringSafe(row.deleted_at) : null,
  };

  return result;
}
