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
 * Create a new service policy (todo_app_service_policies)
 *
 * Inserts an administrative policy with a globally unique code,
 * value/value_type, active flag, and optional effectivity window. Only
 * authenticated system administrators may create policies. Enforces code
 * uniqueness and basic validation of value_type and effectivity window
 * coherence.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator payload
 * @param props.body - Creation payload for the service policy
 * @returns The newly created service policy record
 * @throws {HttpException} 401/403 when the caller is not a valid system admin
 * @throws {HttpException} 400 when input is invalid (e.g., bad value_type, bad
 *   window)
 * @throws {HttpException} 409 when code already exists
 * @throws {HttpException} 500 when an unexpected error occurs
 */
export async function posttodoAppSystemAdminServicePolicies(props: {
  systemAdmin: SystemadminPayload;
  body: ITodoAppServicePolicy.ICreate;
}): Promise<ITodoAppServicePolicy> {
  const { systemAdmin, body } = props;

  // Authorization: ensure caller is an active system admin and owning user is valid
  const membership = await MyGlobal.prisma.todo_app_systemadmins.findFirst({
    where: {
      todo_app_user_id: systemAdmin.id,
      revoked_at: null,
      deleted_at: null,
      user: {
        is: {
          deleted_at: null,
          status: "active",
          email_verified: true,
        },
      },
    },
  });
  if (!membership) {
    throw new HttpException(
      "Forbidden: Only system administrators can create policies",
      403,
    );
  }

  // Validate value_type against supported hints
  const allowedValueTypes = new Set([
    "string",
    "int",
    "double",
    "boolean",
    "datetime",
    "uri",
  ]);
  if (!allowedValueTypes.has(body.value_type)) {
    throw new HttpException("Bad Request: Unsupported value_type", 400);
  }

  // Normalize/validate effectivity window
  const normalizedEffectiveFrom =
    body.effective_from === null
      ? null
      : body.effective_from !== undefined
        ? toISOStringSafe(body.effective_from)
        : undefined;
  const normalizedEffectiveTo =
    body.effective_to === null
      ? null
      : body.effective_to !== undefined
        ? toISOStringSafe(body.effective_to)
        : undefined;

  if (
    normalizedEffectiveFrom !== undefined &&
    normalizedEffectiveFrom !== null &&
    normalizedEffectiveTo !== undefined &&
    normalizedEffectiveTo !== null &&
    !(normalizedEffectiveFrom < normalizedEffectiveTo)
  ) {
    throw new HttpException(
      "Bad Request: effective_from must be earlier than effective_to",
      400,
    );
  }

  // Enforce unique code via pre-check to return a friendly 409 message
  const existing = await MyGlobal.prisma.todo_app_service_policies.findUnique({
    where: { code: body.code },
  });
  if (existing) {
    throw new HttpException("Conflict: Policy code already exists", 409);
  }

  // Prepare identifiers and timestamps
  const id = v4() as string & tags.Format<"uuid">;
  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());

  try {
    await MyGlobal.prisma.todo_app_service_policies.create({
      data: {
        id,
        todo_app_user_id: systemAdmin.id,
        namespace: body.namespace,
        code: body.code,
        name: body.name,
        description: body.description ?? null,
        value: body.value,
        value_type: body.value_type,
        active: body.active,
        effective_from: normalizedEffectiveFrom,
        effective_to: normalizedEffectiveTo,
        created_at: now,
        updated_at: now,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Unique constraint violation (e.g., code)
      throw new HttpException("Conflict: Policy code already exists", 409);
    }
    throw new HttpException("Internal Server Error", 500);
  }

  // Build and return response using prepared values to avoid Date conversions
  return {
    id,
    todo_app_user_id: systemAdmin.id,
    namespace: body.namespace,
    code: body.code,
    name: body.name,
    description: body.description ?? null,
    value: body.value,
    value_type: body.value_type,
    active: body.active,
    effective_from:
      normalizedEffectiveFrom === undefined
        ? undefined
        : normalizedEffectiveFrom,
    effective_to:
      normalizedEffectiveTo === undefined ? undefined : normalizedEffectiveTo,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}
