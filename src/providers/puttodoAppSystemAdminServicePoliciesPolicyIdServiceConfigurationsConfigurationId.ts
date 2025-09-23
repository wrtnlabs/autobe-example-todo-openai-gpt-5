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
 * Update a configuration in todo_app_service_configurations for a given policy.
 *
 * Ensures the configuration belongs to the specified policy, that the caller is
 * an authorized system administrator, validates effective window coherence,
 * preserves uniqueness of (namespace, key, environment), and updates
 * administrative fields. Soft-deleted records are not updatable.
 *
 * Security: Only active, verified system admins may perform this update. The
 * association to the parent policy cannot be changed by this endpoint.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated System Admin payload
 * @param props.policyId - UUID of the owning service policy
 * @param props.configurationId - UUID of the configuration to update
 * @param props.body - Partial update payload for configuration fields
 * @returns Updated configuration details
 * @throws {HttpException} 401/403 when unauthorized
 * @throws {HttpException} 404 when configuration not found under given policy
 *   or soft-deleted
 * @throws {HttpException} 400 when invalid input (e.g., policy reassignment,
 *   incoherent effective window)
 * @throws {HttpException} 409 when uniqueness conflict on
 *   (namespace,key,environment)
 */
export async function puttodoAppSystemAdminServicePoliciesPolicyIdServiceConfigurationsConfigurationId(props: {
  systemAdmin: SystemadminPayload;
  policyId: string & tags.Format<"uuid">;
  configurationId: string & tags.Format<"uuid">;
  body: ITodoAppServiceConfiguration.IUpdate;
}): Promise<ITodoAppServiceConfiguration> {
  const { systemAdmin, policyId, configurationId, body } = props;

  // Authorization: validate active system admin membership and user state
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
      "Unauthorized: System admin privileges required",
      403,
    );
  }

  // Fetch target configuration under policy and ensure it's not soft-deleted
  const existing =
    await MyGlobal.prisma.todo_app_service_configurations.findFirst({
      where: {
        id: configurationId,
        todo_app_service_policy_id: policyId,
        deleted_at: null,
      },
    });
  if (!existing) {
    throw new HttpException(
      "Not Found: Configuration not found under the specified policy or already deleted",
      404,
    );
  }

  // Forbid moving config to a different policy via this endpoint
  if (
    body.todo_app_service_policy_id !== undefined &&
    body.todo_app_service_policy_id !== policyId
  ) {
    throw new HttpException(
      "Bad Request: Cannot change policy association in this endpoint",
      400,
    );
  }

  // Validate effective window coherence when both provided and non-null
  if (body.effective_from !== undefined && body.effective_to !== undefined) {
    if (body.effective_from !== null && body.effective_to !== null) {
      if (Date.parse(body.effective_from) >= Date.parse(body.effective_to)) {
        throw new HttpException(
          "Bad Request: effective_from must be earlier than effective_to",
          400,
        );
      }
    }
  }

  // Compute candidate tuple; check uniqueness if it changes (global unique index)
  const candidateNamespace = body.namespace ?? existing.namespace;
  const candidateKey = body.key ?? existing.key;
  const candidateEnvironment =
    body.environment === undefined ? existing.environment : body.environment;

  const duplicate =
    await MyGlobal.prisma.todo_app_service_configurations.findFirst({
      where: {
        id: { not: configurationId },
        namespace: candidateNamespace,
        key: candidateKey,
        // environment equality handles null correctly
        environment:
          candidateEnvironment === null ? null : candidateEnvironment,
      },
      select: { id: true },
    });
  if (duplicate) {
    throw new HttpException(
      "Conflict: Another configuration with the same (namespace, key, environment) exists",
      409,
    );
  }

  const now = toISOStringSafe(new Date());

  // Perform update with inline data; set actor and updated_at
  try {
    const updated =
      await MyGlobal.prisma.todo_app_service_configurations.update({
        where: { id: configurationId },
        data: {
          // Do NOT allow changing policy via this endpoint
          namespace: body.namespace ?? undefined,
          environment:
            body.environment === undefined ? undefined : body.environment,
          key: body.key ?? undefined,
          value: body.value ?? undefined,
          value_type: body.value_type ?? undefined,
          is_secret: body.is_secret ?? undefined,
          description:
            body.description === undefined ? undefined : body.description,
          active: body.active ?? undefined,
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
          updated_at: now,
          // Attribute administrative actor who performed the update
          todo_app_user_id: systemAdmin.id,
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
      value_type: updated.value_type as EConfigValueType,
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
    };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new HttpException(
        "Conflict: Uniqueness violation on (namespace, key, environment)",
        409,
      );
    }
    throw err;
  }
}
