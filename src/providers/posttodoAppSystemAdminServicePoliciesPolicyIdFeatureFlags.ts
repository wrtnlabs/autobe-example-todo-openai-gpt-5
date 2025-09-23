import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppFeatureFlag } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppFeatureFlag";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

export async function posttodoAppSystemAdminServicePoliciesPolicyIdFeatureFlags(props: {
  systemAdmin: SystemadminPayload;
  policyId: string & tags.Format<"uuid">;
  body: ITodoAppFeatureFlag.ICreate;
}): Promise<ITodoAppFeatureFlag> {
  const { systemAdmin, policyId, body } = props;

  /**
   * Create a new Feature Flag under a specific Service Policy.
   *
   * - Binds the new flag to the provided policyId (FK:
   *   todo_app_service_policy_id)
   * - Only system administrators may create flags
   * - Validates rollout bounds and optional evaluation window coherence
   * - Enforces uniqueness (namespace, code, environment) within the same policy
   *
   * @param props - Request properties
   * @param props.systemAdmin - The authenticated system administrator
   * @param props.policyId - UUID of the parent service policy
   * @param props.body - The feature flag creation payload
   * @returns The created feature flag entity
   * @throws {HttpException} 403 When requester is not an active system admin
   * @throws {HttpException} 404 When parent policy does not exist (or deleted)
   * @throws {HttpException} 409 When a duplicate flag exists
   * @throws {HttpException} 400 On invalid rollout_percentage or time window
   */

  // Authorization: ensure active system admin membership and valid user account
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
      "Forbidden: Only system administrators can create feature flags",
      403,
    );
  }

  // Ensure parent policy exists and is not soft-deleted
  const policy = await MyGlobal.prisma.todo_app_service_policies.findFirst({
    where: { id: policyId, deleted_at: null },
  });
  if (!policy) {
    throw new HttpException("Not Found: Service policy does not exist", 404);
  }

  // Validation: rollout_percentage must be integer within 0..100
  const rollout = body.rollout_percentage;
  if (!(Number.isInteger(rollout) && rollout >= 0 && rollout <= 100)) {
    throw new HttpException(
      "Bad Request: rollout_percentage must be an integer between 0 and 100",
      400,
    );
  }

  // Validation: time window coherence (when both provided and non-null)
  if (typeof body.start_at === "string" && typeof body.end_at === "string") {
    const startMs = Date.parse(body.start_at);
    const endMs = Date.parse(body.end_at);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      throw new HttpException(
        "Bad Request: Invalid date-time format for start_at or end_at",
        400,
      );
    }
    if (endMs <= startMs) {
      throw new HttpException(
        "Bad Request: end_at must be after start_at",
        400,
      );
    }
  }

  // Uniqueness check within the same policy (application-level)
  const duplicate = await MyGlobal.prisma.todo_app_feature_flags.findFirst({
    where: {
      todo_app_service_policy_id: policyId,
      namespace: body.namespace,
      code: body.code,
      environment: body.environment ?? null,
    },
  });
  if (duplicate) {
    throw new HttpException(
      "Conflict: Feature flag with same (namespace, code, environment) already exists in this policy",
      409,
    );
  }

  // Prepare identifiers and timestamps
  const id = v4() as string & tags.Format<"uuid">;
  const now = toISOStringSafe(new Date());

  // Persist the feature flag (bind policy from path; record creator)
  try {
    await MyGlobal.prisma.todo_app_feature_flags.create({
      data: {
        id,
        todo_app_service_policy_id: policyId,
        todo_app_user_id: systemAdmin.id,
        namespace: body.namespace,
        environment: body.environment ?? null,
        code: body.code,
        name: body.name,
        description: body.description ?? null,
        active: body.active,
        rollout_percentage: rollout,
        target_audience: body.target_audience ?? null,
        start_at:
          body.start_at === undefined
            ? undefined
            : body.start_at === null
              ? null
              : toISOStringSafe(body.start_at),
        end_at:
          body.end_at === undefined
            ? undefined
            : body.end_at === null
              ? null
              : toISOStringSafe(body.end_at),
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        // Unique constraint violation (namespace, code, environment)
        throw new HttpException(
          "Conflict: Feature flag with same (namespace, code, environment) already exists",
          409,
        );
      }
      if (err.code === "P2003") {
        // FK policy missing (safety net)
        throw new HttpException(
          "Not Found: Referenced service policy not found",
          404,
        );
      }
    }
    throw new HttpException(
      "Internal Server Error: Failed to create feature flag",
      500,
    );
  }

  // Build and return the DTO using prepared values (avoid reading Date objects)
  return {
    id,
    todo_app_service_policy_id: policyId,
    todo_app_user_id: systemAdmin.id,
    namespace: body.namespace,
    environment: body.environment ?? null,
    code: body.code,
    name: body.name,
    description: body.description ?? null,
    active: body.active,
    rollout_percentage: rollout,
    target_audience: body.target_audience ?? null,
    start_at:
      body.start_at === undefined
        ? undefined
        : body.start_at === null
          ? null
          : toISOStringSafe(body.start_at),
    end_at:
      body.end_at === undefined
        ? undefined
        : body.end_at === null
          ? null
          : toISOStringSafe(body.end_at),
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}
