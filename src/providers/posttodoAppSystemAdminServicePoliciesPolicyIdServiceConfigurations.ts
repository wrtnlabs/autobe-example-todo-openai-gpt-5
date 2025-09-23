import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppServiceConfiguration } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServiceConfiguration";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

export async function posttodoAppSystemAdminServicePoliciesPolicyIdServiceConfigurations(props: {
  systemAdmin: SystemadminPayload;
  policyId: string & tags.Format<"uuid">;
  body: ITodoAppServiceConfiguration.ICreate;
}): Promise<ITodoAppServiceConfiguration> {
  const { systemAdmin, policyId, body } = props;

  /** Helper to narrow value_type to allowed literals without assertions */
  const ensureValueType = (x: string) => {
    switch (x) {
      case "string":
      case "int":
      case "double":
      case "boolean":
      case "datetime":
      case "uri":
        return x;
      default:
        throw new HttpException("Bad Request: Unsupported value_type", 400);
    }
  };

  // 1) Authorization: ensure caller is an active, non-revoked system admin and owning user is active & verified
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
      "Forbidden: Not a current system administrator",
      403,
    );
  }

  // 2) Validate parent policy exists and is not soft-deleted
  const policy = await MyGlobal.prisma.todo_app_service_policies.findFirst({
    where: { id: policyId, deleted_at: null },
  });
  if (!policy) {
    throw new HttpException("Not Found: Service policy does not exist", 404);
  }

  // 3) Validate effective window coherence if both provided
  const fromInput = body.effective_from ?? null;
  const toInput = body.effective_to ?? null;
  if (fromInput !== null && toInput !== null) {
    const fromMs = Date.parse(fromInput);
    const toMs = Date.parse(toInput);
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
      throw new HttpException(
        "Bad Request: Invalid effective_from/effective_to format",
        400,
      );
    }
    if (fromMs >= toMs) {
      throw new HttpException(
        "Bad Request: effective_from must be earlier than effective_to",
        400,
      );
    }
  }

  // 4) Prepare identifiers and timestamps
  const newId = v4() as string & tags.Format<"uuid">;
  const now = toISOStringSafe(new Date());
  const effectiveFrom = fromInput ? toISOStringSafe(fromInput) : null;
  const effectiveTo = toInput ? toISOStringSafe(toInput) : null;
  const valueType = ensureValueType(body.value_type);

  // 5) Create configuration; handle uniqueness conflicts
  try {
    const created =
      await MyGlobal.prisma.todo_app_service_configurations.create({
        data: {
          id: newId,
          todo_app_user_id: systemAdmin.id,
          todo_app_service_policy_id: policyId,
          namespace: body.namespace,
          environment: body.environment ?? null,
          key: body.key,
          value: body.value,
          value_type: valueType,
          is_secret: body.is_secret,
          description: body.description ?? null,
          active: body.active,
          effective_from: effectiveFrom,
          effective_to: effectiveTo,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
        select: {
          id: true,
          todo_app_user_id: true,
          todo_app_service_policy_id: true,
          namespace: true,
          environment: true,
          key: true,
          value: true,
          value_type: true,
          is_secret: true,
          description: true,
          active: true,
          effective_from: true,
          effective_to: true,
          created_at: true,
          updated_at: true,
          deleted_at: true,
        },
      });

    // 6) Build response (redact value when secret); reuse prepared timestamps to avoid Date handling
    return {
      id: created.id as string & tags.Format<"uuid">,
      todo_app_user_id: created.todo_app_user_id ?? null,
      todo_app_service_policy_id: created.todo_app_service_policy_id ?? null,
      namespace: created.namespace,
      environment: created.environment ?? null,
      key: created.key,
      value: created.is_secret ? "[REDACTED]" : created.value,
      value_type: valueType,
      is_secret: created.is_secret,
      description: created.description ?? null,
      active: created.active,
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
      created_at: now,
      updated_at: now,
      deleted_at: created.deleted_at
        ? toISOStringSafe(created.deleted_at)
        : null,
    };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new HttpException(
        "Conflict: Configuration with the same (namespace, key, environment) already exists",
        409,
      );
    }
    throw new HttpException("Internal Server Error", 500);
  }
}
