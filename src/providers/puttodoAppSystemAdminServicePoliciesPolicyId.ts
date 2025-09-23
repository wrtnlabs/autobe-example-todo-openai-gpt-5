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
 * Update a service policy (todo_app_service_policies) by id.
 *
 * Allows system administrators to modify policy attributes such as namespace,
 * code, name, description, value, value_type, active flag, and effective
 * window. Enforces code uniqueness and updates the updated_at timestamp.
 *
 * Authorization: requires an active System Admin membership for the requester.
 *
 * @param props - Request properties
 * @param props.systemAdmin - Authenticated system admin payload
 * @param props.policyId - UUID of the policy to update
 *   (todo_app_service_policies.id)
 * @param props.body - Partial update payload for policy fields
 * @returns The updated policy with all attributes
 * @throws {HttpException} 401/403 when unauthorized; 404 when not found; 400
 *   for validation errors; 409 for uniqueness conflicts
 */
export async function puttodoAppSystemAdminServicePoliciesPolicyId(props: {
  systemAdmin: SystemadminPayload;
  policyId: string & tags.Format<"uuid">;
  body: ITodoAppServicePolicy.IUpdate;
}): Promise<ITodoAppServicePolicy> {
  const { systemAdmin, policyId, body } = props;

  // Authorization: ensure active system admin membership and valid owning user state
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
    throw new HttpException("Forbidden: Not a system administrator", 403);

  // Ensure target policy exists and is not soft-deleted
  const existing = await MyGlobal.prisma.todo_app_service_policies.findFirst({
    where: { id: policyId, deleted_at: null },
  });
  if (!existing) throw new HttpException("Not Found", 404);

  // Normalize effective window for validation (only when provided)
  const normalizedEffectiveFrom =
    body.effective_from === undefined
      ? undefined
      : body.effective_from === null
        ? null
        : toISOStringSafe(body.effective_from);
  const normalizedEffectiveTo =
    body.effective_to === undefined
      ? undefined
      : body.effective_to === null
        ? null
        : toISOStringSafe(body.effective_to);

  if (
    normalizedEffectiveFrom !== undefined &&
    normalizedEffectiveFrom !== null &&
    normalizedEffectiveTo !== undefined &&
    normalizedEffectiveTo !== null
  ) {
    // Lexicographic comparison is valid for ISO 8601 UTC timestamps
    if (!(normalizedEffectiveFrom < normalizedEffectiveTo)) {
      throw new HttpException(
        "Bad Request: effective_from must be earlier than effective_to",
        400,
      );
    }
  }

  // Enforce code uniqueness when attempting to change code
  if (body.code !== undefined && body.code !== null) {
    const dup = await MyGlobal.prisma.todo_app_service_policies.findFirst({
      where: {
        code: body.code,
        id: { not: policyId },
      },
    });
    if (dup) {
      throw new HttpException("Conflict: Duplicate policy code", 409);
    }
  }

  const now = toISOStringSafe(new Date());

  try {
    const updated = await MyGlobal.prisma.todo_app_service_policies.update({
      where: { id: policyId },
      data: {
        // Required schema fields: treat null as skip (undefined)
        namespace:
          body.namespace === null ? undefined : (body.namespace ?? undefined),
        code: body.code === null ? undefined : (body.code ?? undefined),
        name: body.name === null ? undefined : (body.name ?? undefined),
        value: body.value === null ? undefined : (body.value ?? undefined),
        value_type:
          body.value_type === null ? undefined : (body.value_type ?? undefined),
        active: body.active === null ? undefined : (body.active ?? undefined),
        // Nullable schema fields: pass through nulls explicitly, skip when undefined
        description:
          body.description === undefined ? undefined : body.description,
        effective_from:
          body.effective_from === undefined
            ? undefined
            : body.effective_from === null
              ? null
              : normalizedEffectiveFrom!,
        effective_to:
          body.effective_to === undefined
            ? undefined
            : body.effective_to === null
              ? null
              : normalizedEffectiveTo!,
        // System-managed timestamp
        updated_at: now,
      },
      select: {
        id: true,
        todo_app_user_id: true,
        namespace: true,
        code: true,
        name: true,
        description: true,
        value: true,
        value_type: true,
        active: true,
        effective_from: true,
        effective_to: true,
        created_at: true,
        updated_at: true,
        deleted_at: true,
      },
    });

    return {
      id: updated.id as string & tags.Format<"uuid">,
      todo_app_user_id:
        updated.todo_app_user_id === null
          ? null
          : (updated.todo_app_user_id as string & tags.Format<"uuid">),
      namespace: updated.namespace,
      code: updated.code,
      name: updated.name,
      description: updated.description ?? null,
      value: updated.value,
      value_type: updated.value_type,
      active: updated.active,
      effective_from: updated.effective_from
        ? toISOStringSafe(updated.effective_from)
        : null,
      effective_to: updated.effective_to
        ? toISOStringSafe(updated.effective_to)
        : null,
      created_at: toISOStringSafe(updated.created_at),
      updated_at: toISOStringSafe(updated.updated_at),
      deleted_at: updated.deleted_at
        ? toISOStringSafe(updated.deleted_at)
        : null,
    };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Unique constraint failed (e.g., code)
      throw new HttpException("Conflict: Duplicate policy code", 409);
    }
    throw err;
  }
}
