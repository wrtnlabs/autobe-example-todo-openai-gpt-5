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
 * Create a new service configuration (todo_app_service_configurations)
 *
 * Inserts a configuration record with namespace, optional environment, key,
 * value, value_type, is_secret, optional description, active, and optional
 * effectivity window. Links to an optional governing policy and captures the
 * acting system administrator in todo_app_user_id. Enforces unique (namespace,
 * key, environment) constraint and validates value_type and effectivity window
 * coherence.
 *
 * Authorization: Only authenticated systemAdmin can create configurations.
 * Verifies active, non-revoked membership and active, verified user account.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator
 * @param props.body - Creation payload for the configuration
 * @returns The created configuration record
 * @throws {HttpException} 401/403 when unauthorized
 * @throws {HttpException} 400 on invalid input (value_type, time window, FK)
 * @throws {HttpException} 409 on uniqueness conflict
 */
export async function posttodoAppSystemAdminServiceConfigurations(props: {
  systemAdmin: SystemadminPayload;
  body: ITodoAppServiceConfiguration.ICreate;
}): Promise<ITodoAppServiceConfiguration> {
  const { systemAdmin, body } = props;

  // Authorization: ensure the caller is an active system admin and user is valid
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

  // Validate value_type against allowed hints
  const allowedValueTypes = [
    "string",
    "int",
    "double",
    "boolean",
    "datetime",
    "uri",
  ] as const;
  const isAllowedValueType = (
    s: string,
  ): s is (typeof allowedValueTypes)[number] => {
    for (const v of allowedValueTypes) if (s === v) return true;
    return false;
  };
  if (!isAllowedValueType(body.value_type)) {
    throw new HttpException("Bad Request: Unsupported value_type", 400);
  }

  // Validate effective window coherence when both provided (from < to)
  if (
    body.effective_from !== undefined &&
    body.effective_from !== null &&
    body.effective_to !== undefined &&
    body.effective_to !== null
  ) {
    const fromMs = new Date(body.effective_from).getTime();
    const toMs = new Date(body.effective_to).getTime();
    if (!(fromMs < toMs)) {
      throw new HttpException(
        "Bad Request: effective_from must be earlier than effective_to",
        400,
      );
    }
  }

  // Prepare IDs and timestamps
  const id = v4() as string & tags.Format<"uuid">;
  const now = toISOStringSafe(new Date());
  const effective_from =
    body.effective_from !== undefined && body.effective_from !== null
      ? toISOStringSafe(body.effective_from)
      : null;
  const effective_to =
    body.effective_to !== undefined && body.effective_to !== null
      ? toISOStringSafe(body.effective_to)
      : null;

  try {
    const created =
      await MyGlobal.prisma.todo_app_service_configurations.create({
        data: {
          id,
          todo_app_user_id: systemAdmin.id,
          todo_app_service_policy_id: body.todo_app_service_policy_id ?? null,
          namespace: body.namespace,
          environment: body.environment ?? null,
          key: body.key,
          value: body.value,
          value_type: body.value_type,
          is_secret: body.is_secret,
          description: body.description ?? null,
          active: body.active,
          effective_from,
          effective_to,
          created_at: now,
          updated_at: now,
        },
      });

    return {
      id: created.id as string & tags.Format<"uuid">,
      todo_app_user_id:
        created.todo_app_user_id === null
          ? undefined
          : (created.todo_app_user_id as string & tags.Format<"uuid">),
      todo_app_service_policy_id:
        created.todo_app_service_policy_id === null
          ? undefined
          : (created.todo_app_service_policy_id as string &
              tags.Format<"uuid">),
      namespace: created.namespace,
      environment:
        created.environment === null ? undefined : created.environment,
      key: created.key,
      value: created.value,
      value_type: body.value_type as any, // already validated against literals
      is_secret: created.is_secret,
      description:
        created.description === null ? undefined : created.description,
      active: created.active,
      effective_from: effective_from === null ? undefined : effective_from,
      effective_to: effective_to === null ? undefined : effective_to,
      created_at: toISOStringSafe(created.created_at),
      updated_at: toISOStringSafe(created.updated_at),
      deleted_at: created.deleted_at
        ? toISOStringSafe(created.deleted_at)
        : undefined,
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // Unique constraint violation
      if (err.code === "P2002") {
        throw new HttpException(
          "Conflict: Configuration with same (namespace, key, environment) already exists",
          409,
        );
      }
      // FK constraint violation
      if (err.code === "P2003") {
        throw new HttpException(
          "Bad Request: Invalid foreign key reference",
          400,
        );
      }
    }
    throw err;
  }
}
