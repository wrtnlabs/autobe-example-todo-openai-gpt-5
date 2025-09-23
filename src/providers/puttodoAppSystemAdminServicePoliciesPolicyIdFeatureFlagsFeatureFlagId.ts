import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppFeatureFlag } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppFeatureFlag";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

export async function puttodoAppSystemAdminServicePoliciesPolicyIdFeatureFlagsFeatureFlagId(props: {
  systemAdmin: SystemadminPayload;
  policyId: string & tags.Format<"uuid">;
  featureFlagId: string & tags.Format<"uuid">;
  body: ITodoAppFeatureFlag.IUpdate;
}): Promise<ITodoAppFeatureFlag> {
  const { systemAdmin, policyId, featureFlagId, body } = props;

  // Authorization: ensure caller is an active system admin
  const adminMembership = await MyGlobal.prisma.todo_app_systemadmins.findFirst(
    {
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
    },
  );
  if (!adminMembership) {
    throw new HttpException(
      "Forbidden: Only system administrators may update feature flags",
      403,
    );
  }

  // Locate target flag under the given policy; exclude soft-deleted
  const existing = await MyGlobal.prisma.todo_app_feature_flags.findFirst({
    where: {
      id: featureFlagId,
      todo_app_service_policy_id: policyId,
      deleted_at: null,
    },
  });
  if (!existing) {
    throw new HttpException("Not Found", 404);
  }

  // Policy association must not be changed through this endpoint
  if (
    body.todo_app_service_policy_id !== undefined &&
    body.todo_app_service_policy_id !== null &&
    body.todo_app_service_policy_id !== policyId
  ) {
    throw new HttpException(
      "Bad Request: Cannot change governing policy via this endpoint",
      400,
    );
  }

  // Business validations
  if (body.rollout_percentage !== undefined) {
    const rp = Number(body.rollout_percentage);
    if (!Number.isFinite(rp) || rp < 0 || rp > 100) {
      throw new HttpException(
        "Bad Request: rollout_percentage must be between 0 and 100",
        400,
      );
    }
  }

  // Validate time window ordering if both are (or will be) present
  const startCandidate: (string & tags.Format<"date-time">) | null =
    body.start_at === undefined
      ? existing.start_at
        ? toISOStringSafe(existing.start_at)
        : null
      : body.start_at === null
        ? null
        : toISOStringSafe(body.start_at);
  const endCandidate: (string & tags.Format<"date-time">) | null =
    body.end_at === undefined
      ? existing.end_at
        ? toISOStringSafe(existing.end_at)
        : null
      : body.end_at === null
        ? null
        : toISOStringSafe(body.end_at);
  if (startCandidate !== null && endCandidate !== null) {
    if (Date.parse(startCandidate) > Date.parse(endCandidate)) {
      throw new HttpException(
        "Bad Request: start_at must be earlier than or equal to end_at",
        400,
      );
    }
  }

  const now = toISOStringSafe(new Date());

  try {
    const updated = await MyGlobal.prisma.todo_app_feature_flags.update({
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
        updated_at: now,
      },
      select: {
        id: true,
        todo_app_service_policy_id: true,
        todo_app_user_id: true,
        namespace: true,
        environment: true,
        code: true,
        name: true,
        description: true,
        active: true,
        rollout_percentage: true,
        target_audience: true,
        start_at: true,
        end_at: true,
        created_at: true,
        updated_at: true,
        deleted_at: true,
      },
    });

    return {
      id: updated.id as string & tags.Format<"uuid">,
      todo_app_service_policy_id:
        updated.todo_app_service_policy_id === null
          ? null
          : (updated.todo_app_service_policy_id as string &
              tags.Format<"uuid">),
      todo_app_user_id:
        updated.todo_app_user_id === null
          ? null
          : (updated.todo_app_user_id as string & tags.Format<"uuid">),
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
      updated_at: toISOStringSafe(updated.updated_at),
      deleted_at: updated.deleted_at
        ? toISOStringSafe(updated.deleted_at)
        : null,
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        throw new HttpException(
          "Conflict: (namespace, code, environment) must be unique",
          409,
        );
      }
      if (err.code === "P2025") {
        throw new HttpException("Not Found", 404);
      }
    }
    throw new HttpException("Internal Server Error", 500);
  }
}
