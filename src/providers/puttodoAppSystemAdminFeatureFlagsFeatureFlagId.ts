import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppFeatureFlag } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppFeatureFlag";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

export async function puttodoAppSystemAdminFeatureFlagsFeatureFlagId(props: {
  systemAdmin: SystemadminPayload;
  featureFlagId: string & tags.Format<"uuid">;
  body: ITodoAppFeatureFlag.IUpdate;
}): Promise<ITodoAppFeatureFlag> {
  const { systemAdmin, featureFlagId, body } = props;

  // Authorization: ensure caller is an active, non-revoked system admin and user is valid
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
    throw new HttpException("Forbidden: Not a system admin", 403);

  // Fetch target flag ensuring it's not soft-deleted
  const existing = await MyGlobal.prisma.todo_app_feature_flags.findFirst({
    where: { id: featureFlagId, deleted_at: null },
  });
  if (!existing)
    throw new HttpException("Not Found: Feature flag does not exist", 404);

  // Validate rollout_percentage range if provided
  if (body.rollout_percentage !== undefined) {
    const rp = body.rollout_percentage;
    if (rp < 0 || rp > 100) {
      throw new HttpException(
        "Bad Request: rollout_percentage must be between 0 and 100",
        400,
      );
    }
  }

  // Resolve effective window for validation (using provided values or existing ones)
  const currentStart = existing.start_at
    ? toISOStringSafe(existing.start_at)
    : null;
  const currentEnd = existing.end_at ? toISOStringSafe(existing.end_at) : null;
  const nextStart = body.start_at === undefined ? currentStart : body.start_at;
  const nextEnd = body.end_at === undefined ? currentEnd : body.end_at;
  if (
    nextStart !== null &&
    nextEnd !== null &&
    nextStart !== undefined &&
    nextEnd !== undefined
  ) {
    if (new Date(nextEnd).getTime() < new Date(nextStart).getTime()) {
      throw new HttpException(
        "Bad Request: end_at must be greater than or equal to start_at",
        400,
      );
    }
  }

  // Validate policy linkage if provided
  if (
    body.todo_app_service_policy_id !== undefined &&
    body.todo_app_service_policy_id !== null
  ) {
    const policy = await MyGlobal.prisma.todo_app_service_policies.findFirst({
      where: { id: body.todo_app_service_policy_id, deleted_at: null },
    });
    if (!policy)
      throw new HttpException(
        "Bad Request: Referenced policy does not exist",
        400,
      );
  }

  const now = toISOStringSafe(new Date());

  // Apply update with proper null/undefined handling and date conversions
  let updated;
  try {
    updated = await MyGlobal.prisma.todo_app_feature_flags.update({
      where: { id: featureFlagId },
      data: {
        namespace: body.namespace ?? undefined,
        environment:
          body.environment === undefined ? undefined : body.environment,
        code: body.code ?? undefined,
        name: body.name ?? undefined,
        description:
          body.description === undefined ? undefined : body.description,
        active: body.active ?? undefined,
        rollout_percentage: body.rollout_percentage ?? undefined,
        target_audience:
          body.target_audience === undefined ? undefined : body.target_audience,
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
        todo_app_service_policy_id:
          body.todo_app_service_policy_id === undefined
            ? undefined
            : body.todo_app_service_policy_id,
        updated_at: now,
      },
    });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err) {
      const e = err as Prisma.PrismaClientKnownRequestError;
      if (e.code === "P2002") {
        throw new HttpException(
          "Conflict: (namespace, code, environment) must be unique",
          409,
        );
      }
    }
    throw err;
  }

  // Best-effort governance logs (do not block main flow on errors)
  try {
    await MyGlobal.prisma.todo_app_admin_actions.create({
      data: {
        id: v4(),
        admin_user_id: systemAdmin.id,
        target_user_id: null,
        action: "update_feature_flag",
        reason: null,
        notes: null,
        success: true,
        idempotency_key: null,
        created_at: now,
        updated_at: now,
      },
    });
  } catch {}
  try {
    await MyGlobal.prisma.todo_app_audit_logs.create({
      data: {
        id: v4(),
        actor_user_id: systemAdmin.id,
        target_user_id: null,
        action: "update_feature_flag",
        resource_type: "todo_app_feature_flags",
        resource_id: featureFlagId,
        success: true,
        ip: null,
        user_agent: null,
        created_at: now,
        updated_at: now,
      },
    });
  } catch {}

  // Prepare response with proper date conversions and optional/nullable handling
  const result = {
    id: updated.id,
    todo_app_service_policy_id: updated.todo_app_service_policy_id ?? null,
    todo_app_user_id: updated.todo_app_user_id ?? null,
    namespace: updated.namespace,
    environment: updated.environment ?? null,
    code: updated.code,
    name: updated.name,
    description: updated.description ?? null,
    active: updated.active,
    rollout_percentage: updated.rollout_percentage,
    target_audience: updated.target_audience ?? null,
    start_at: updated.start_at ? toISOStringSafe(updated.start_at) : null,
    end_at: updated.end_at ? toISOStringSafe(updated.end_at) : null,
    created_at: toISOStringSafe(updated.created_at),
    updated_at: now,
    deleted_at: updated.deleted_at ? toISOStringSafe(updated.deleted_at) : null,
  };

  return typia.assert<ITodoAppFeatureFlag>(result);
}
