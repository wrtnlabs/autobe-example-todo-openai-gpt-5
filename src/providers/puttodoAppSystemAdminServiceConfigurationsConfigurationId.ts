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
 * Update an existing service configuration (todo_app_service_configurations).
 *
 * Updates mutable fields (value, value_type, is_secret, description, active,
 * effective window, and optionally namespace/key/environment and policy link)
 * while enforcing authorization and uniqueness. Soft-deleted records are not
 * updatable. The administrator actor is recorded on update.
 *
 * Authorization: only authenticated System Admins may perform this action. The
 * function verifies active, non-revoked membership and an active, verified
 * user.
 *
 * @param props - Request properties
 * @param props.systemAdmin - Authenticated System Admin payload
 * @param props.configurationId - UUID of the configuration to update
 * @param props.body - Partial update payload
 * @returns The updated configuration record
 * @throws {HttpException} 401/403 when not authorized as system admin
 * @throws {HttpException} 404 when configuration not found or soft-deleted
 * @throws {HttpException} 404 when provided policy id does not exist
 * @throws {HttpException} 409 when (namespace, key, environment) violates
 *   uniqueness
 * @throws {HttpException} 500 on unexpected errors
 */
export async function puttodoAppSystemAdminServiceConfigurationsConfigurationId(props: {
  systemAdmin: SystemadminPayload;
  configurationId: string & tags.Format<"uuid">;
  body: ITodoAppServiceConfiguration.IUpdate;
}): Promise<ITodoAppServiceConfiguration> {
  const { systemAdmin, configurationId, body } = props;

  // Authorization: ensure requester is an active system admin
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
  if (!adminMembership)
    throw new HttpException(
      "Unauthorized: Only system administrators can update configurations",
      403,
    );

  // Load target configuration and ensure it's not soft-deleted
  const existing =
    await MyGlobal.prisma.todo_app_service_configurations.findUnique({
      where: { id: configurationId },
    });
  if (!existing)
    throw new HttpException("Not Found: Configuration does not exist", 404);
  if (existing.deleted_at !== null)
    throw new HttpException("Not Found: Configuration has been deleted", 404);

  // Validate provided policy id (if any)
  if (body.todo_app_service_policy_id !== undefined) {
    if (body.todo_app_service_policy_id !== null) {
      const policy = await MyGlobal.prisma.todo_app_service_policies.findFirst({
        where: { id: body.todo_app_service_policy_id, deleted_at: null },
      });
      if (!policy)
        throw new HttpException(
          "Not Found: Service policy does not exist",
          404,
        );
    }
  }

  // Prepare timestamps
  const now = toISOStringSafe(new Date());

  try {
    const updated =
      await MyGlobal.prisma.todo_app_service_configurations.update({
        where: { id: configurationId },
        data: {
          // FK updates
          todo_app_service_policy_id:
            body.todo_app_service_policy_id === undefined
              ? undefined
              : body.todo_app_service_policy_id,
          // Tuple fields (respect uniqueness)
          namespace: body.namespace ?? undefined,
          environment:
            body.environment === undefined ? undefined : body.environment,
          key: body.key ?? undefined,
          // Core mutable fields
          value: body.value ?? undefined,
          value_type: body.value_type ?? undefined,
          is_secret: body.is_secret ?? undefined,
          description: body.description ?? undefined,
          active: body.active ?? undefined,
          // Effective window
          effective_from:
            body.effective_from === undefined
              ? undefined
              : body.effective_from === null
                ? null
                : toISOStringSafe(body.effective_from),
          effective_to:
            body.effective_to === undefined
              ? undefined
              : body.effective_to === null
                ? null
                : toISOStringSafe(body.effective_to),
          // Audit fields
          todo_app_user_id: systemAdmin.id,
          updated_at: now,
        },
      });

    return {
      id: updated.id as string & tags.Format<"uuid">,
      todo_app_user_id:
        updated.todo_app_user_id === null
          ? null
          : (updated.todo_app_user_id as string & tags.Format<"uuid">),
      todo_app_service_policy_id:
        updated.todo_app_service_policy_id === null
          ? null
          : (updated.todo_app_service_policy_id as string &
              tags.Format<"uuid">),
      namespace: updated.namespace,
      environment: updated.environment ?? null,
      key: updated.key,
      value: updated.value,
      value_type: updated.value_type as
        | "string"
        | "int"
        | "double"
        | "boolean"
        | "datetime"
        | "uri",
      is_secret: updated.is_secret,
      description: updated.description ?? null,
      active: updated.active,
      effective_from: updated.effective_from
        ? toISOStringSafe(updated.effective_from)
        : null,
      effective_to: updated.effective_to
        ? toISOStringSafe(updated.effective_to)
        : null,
      created_at: toISOStringSafe(updated.created_at),
      updated_at: now,
      deleted_at: updated.deleted_at
        ? toISOStringSafe(updated.deleted_at)
        : null,
    } satisfies ITodoAppServiceConfiguration;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        throw new HttpException(
          "Conflict: Another configuration with the same (namespace, key, environment) already exists",
          409,
        );
      }
    }
    throw new HttpException("Internal Server Error", 500);
  }
}
