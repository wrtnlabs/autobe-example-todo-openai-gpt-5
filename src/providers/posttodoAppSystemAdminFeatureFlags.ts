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
 * Create a new feature flag (todo_app_feature_flags).
 *
 * Inserts a feature flag scoped by namespace/environment with rollout controls
 * and optional targeting. Only system administrators may perform this action.
 * Validates rollout percentage bounds and start/end window coherence, and
 * enforces uniqueness on (namespace, code, environment).
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator payload
 * @param props.body - Feature flag creation payload
 * @returns The newly created feature flag entity
 * @throws {HttpException} 401 when authentication missing
 * @throws {HttpException} 403 when caller is not an active system admin
 * @throws {HttpException} 400 for validation errors (rollout bounds, time
 *   window)
 * @throws {HttpException} 409 when uniqueness (namespace, code, environment)
 *   conflicts
 * @throws {HttpException} 500 for unexpected database errors
 */
export async function posttodoAppSystemAdminFeatureFlags(props: {
  systemAdmin: SystemadminPayload;
  body: ITodoAppFeatureFlag.ICreate;
}): Promise<ITodoAppFeatureFlag> {
  const { systemAdmin, body } = props;

  // Authorization: ensure the caller is an active system administrator
  if (!systemAdmin || !systemAdmin.id) {
    throw new HttpException("Unauthorized", 401);
  }

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

  // Basic validations (business rules)
  if (
    typeof body.rollout_percentage !== "number" ||
    Number.isNaN(body.rollout_percentage) ||
    body.rollout_percentage < 0 ||
    body.rollout_percentage > 100
  ) {
    throw new HttpException(
      "Bad Request: rollout_percentage must be between 0 and 100",
      400,
    );
  }

  if (
    body.start_at !== undefined &&
    body.start_at !== null &&
    body.end_at !== undefined &&
    body.end_at !== null
  ) {
    const s = Date.parse(body.start_at);
    const e = Date.parse(body.end_at);
    if (!(Number.isFinite(s) && Number.isFinite(e))) {
      throw new HttpException(
        "Bad Request: start_at/end_at must be valid ISO 8601 date-time strings",
        400,
      );
    }
    if (e <= s) {
      throw new HttpException(
        "Bad Request: end_at must be after start_at",
        400,
      );
    }
  }

  // Timestamps
  const now = toISOStringSafe(new Date());

  try {
    const created = await MyGlobal.prisma.todo_app_feature_flags.create({
      data: {
        id: v4() as string & tags.Format<"uuid">,
        todo_app_service_policy_id: body.todo_app_service_policy_id ?? null,
        todo_app_user_id: systemAdmin.id,
        namespace: body.namespace,
        environment: body.environment ?? null,
        code: body.code,
        name: body.name,
        description: body.description ?? null,
        active: body.active,
        rollout_percentage: body.rollout_percentage,
        target_audience: body.target_audience ?? null,
        start_at: body.start_at ? toISOStringSafe(body.start_at) : null,
        end_at: body.end_at ? toISOStringSafe(body.end_at) : null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    });

    // Map Prisma result to API structure with proper date conversions
    const result: ITodoAppFeatureFlag = {
      id: created.id as string & tags.Format<"uuid">,
      todo_app_service_policy_id:
        created.todo_app_service_policy_id === null
          ? null
          : (created.todo_app_service_policy_id as string &
              tags.Format<"uuid">),
      todo_app_user_id:
        created.todo_app_user_id === null
          ? null
          : (created.todo_app_user_id as string & tags.Format<"uuid">),
      namespace: created.namespace,
      environment: created.environment ?? null,
      code: created.code,
      name: created.name,
      description: created.description ?? null,
      active: created.active,
      rollout_percentage: created.rollout_percentage,
      target_audience: created.target_audience ?? null,
      start_at: created.start_at ? toISOStringSafe(created.start_at) : null,
      end_at: created.end_at ? toISOStringSafe(created.end_at) : null,
      created_at: toISOStringSafe(created.created_at),
      updated_at: toISOStringSafe(created.updated_at),
      deleted_at: created.deleted_at
        ? toISOStringSafe(created.deleted_at)
        : null,
    };
    return result;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // Unique constraint failed on the fields: (namespace, code, environment)
      if (err.code === "P2002") {
        throw new HttpException(
          "Conflict: Feature flag with same (namespace, code, environment) already exists",
          409,
        );
      }
    }
    throw new HttpException("Internal Server Error", 500);
  }
}
