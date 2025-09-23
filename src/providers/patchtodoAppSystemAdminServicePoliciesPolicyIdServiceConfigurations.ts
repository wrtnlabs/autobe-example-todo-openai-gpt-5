import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppServiceConfiguration } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServiceConfiguration";
import { IPageITodoAppServiceConfiguration } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppServiceConfiguration";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * List/search service configurations (todo_app_service_configurations) for a
 * policy.
 *
 * Retrieves a filtered, searchable, and paginated list of service
 * configurations associated with a specific policy
 * (todo_app_service_policies.id via todo_app_service_policy_id). Supports
 * domain filters (namespace, environment, active), effective window checks
 * (effective_from/effective_to), and keyword search over key/description.
 * Secret values are not exposed in summaries.
 *
 * Authorization: Requires a valid System Admin. Verifies current, non-revoked
 * system admin membership and active, verified user account.
 *
 * @param props - Request properties
 * @param props.systemAdmin - Authenticated system admin payload
 * @param props.policyId - UUID of parent service policy to scope configurations
 * @param props.body - Filters, pagination, and sorting options
 * @returns Paginated list of configuration summaries scoped to the policy
 * @throws {HttpException} 400 When inputs are invalid (e.g., limit>100,
 *   malformed effective_at)
 * @throws {HttpException} 403 When the caller lacks system admin privileges
 * @throws {HttpException} 404 When the specified policy does not exist
 */
export async function patchtodoAppSystemAdminServicePoliciesPolicyIdServiceConfigurations(props: {
  systemAdmin: SystemadminPayload;
  policyId: string & tags.Format<"uuid">;
  body: ITodoAppServiceConfiguration.IRequest;
}): Promise<IPageITodoAppServiceConfiguration.ISummary> {
  const { systemAdmin, policyId, body } = props;

  // Authorization: verify active, non-revoked system admin membership
  const membership = await MyGlobal.prisma.todo_app_systemadmins.findFirst({
    where: {
      todo_app_user_id: systemAdmin.id,
      revoked_at: null,
      deleted_at: null,
      user: { deleted_at: null, status: "active", email_verified: true },
    },
  });
  if (!membership) throw new HttpException("Forbidden", 403);

  // Ensure parent policy exists and is not soft-deleted
  const policy = await MyGlobal.prisma.todo_app_service_policies.findFirst({
    where: { id: policyId, deleted_at: null },
    select: { id: true },
  });
  if (!policy) throw new HttpException("Not Found", 404);

  // Validate pagination
  const pageRaw = body.page ?? 1;
  const limitRaw = body.limit ?? 20;
  if (pageRaw < 1)
    throw new HttpException("Bad Request: page must be >= 1", 400);
  if (limitRaw < 1 || limitRaw > 100)
    throw new HttpException(
      "Bad Request: limit must be between 1 and 100",
      400,
    );

  // Validate effective_at if provided
  const effectiveAt = body.effective_at ?? null;
  if (effectiveAt !== null) {
    // Simple ISO 8601 Zulu time regex (YYYY-MM-DDTHH:mm:ss(.sss)?Z)
    const iso8601Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
    if (!iso8601Z.test(effectiveAt))
      throw new HttpException(
        "Bad Request: effective_at must be ISO 8601 date-time (e.g., 2024-01-01T00:00:00.000Z)",
        400,
      );
  }

  // Build filters (soft delete respected by default)
  const whereCondition = {
    todo_app_service_policy_id: policyId,
    deleted_at: null,
    ...(body.namespace !== undefined &&
      body.namespace !== null && {
        namespace: body.namespace,
      }),
    ...(body.environment !== undefined &&
      body.environment !== null && {
        environment: body.environment,
      }),
    ...(body.active !== undefined &&
      body.active !== null && { active: body.active }),
    ...(body.value_type !== undefined &&
      body.value_type !== null && {
        value_type: body.value_type,
      }),
    ...(body.q !== undefined && body.q !== null && body.q.length > 0
      ? {
          OR: [
            { key: { contains: body.q } },
            { description: { contains: body.q } },
          ],
        }
      : {}),
    ...(effectiveAt !== null
      ? {
          AND: [
            {
              OR: [
                { effective_from: null },
                { effective_from: { lte: effectiveAt } },
              ],
            },
            {
              OR: [
                { effective_to: null },
                { effective_to: { gte: effectiveAt } },
              ],
            },
          ],
        }
      : {}),
  } as const;

  const sortField = body.orderBy ?? "created_at";
  const sortOrder = body.order ?? "desc";
  const page = pageRaw;
  const limit = limitRaw;
  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_service_configurations.findMany({
      where: whereCondition,
      orderBy:
        sortField === "created_at"
          ? { created_at: sortOrder }
          : sortField === "updated_at"
            ? { updated_at: sortOrder }
            : sortField === "namespace"
              ? { namespace: sortOrder }
              : sortField === "environment"
                ? { environment: sortOrder }
                : sortField === "key"
                  ? { key: sortOrder }
                  : sortField === "active"
                    ? { active: sortOrder }
                    : sortField === "value_type"
                      ? { value_type: sortOrder }
                      : sortField === "effective_from"
                        ? { effective_from: sortOrder }
                        : sortField === "effective_to"
                          ? { effective_to: sortOrder }
                          : sortField === "id"
                            ? { id: sortOrder }
                            : { created_at: sortOrder },
      skip: skip,
      take: limit,
      select: {
        id: true,
        todo_app_service_policy_id: true,
        namespace: true,
        environment: true,
        key: true,
        value_type: true,
        is_secret: true,
        active: true,
        effective_from: true,
        effective_to: true,
        created_at: true,
        updated_at: true,
      },
    }),
    MyGlobal.prisma.todo_app_service_configurations.count({
      where: whereCondition,
    }),
  ]);

  const data = rows.map((r) => ({
    id: typia.assert<string & tags.Format<"uuid">>(r.id),
    todo_app_service_policy_id:
      r.todo_app_service_policy_id === null
        ? null
        : typia.assert<string & tags.Format<"uuid">>(
            r.todo_app_service_policy_id,
          ),
    namespace: r.namespace,
    environment: r.environment ?? null,
    key: r.key,
    value_type: r.value_type,
    is_secret: r.is_secret,
    active: r.active,
    effective_from: r.effective_from ? toISOStringSafe(r.effective_from) : null,
    effective_to: r.effective_to ? toISOStringSafe(r.effective_to) : null,
    created_at: toISOStringSafe(r.created_at),
    updated_at: toISOStringSafe(r.updated_at),
  }));

  const pagination = {
    current: typia.assert<number & tags.Type<"int32"> & tags.Minimum<0>>(
      Number(page),
    ),
    limit: typia.assert<number & tags.Type<"int32"> & tags.Minimum<0>>(
      Number(limit),
    ),
    records: typia.assert<number & tags.Type<"int32"> & tags.Minimum<0>>(
      Number(total),
    ),
    pages: typia.assert<number & tags.Type<"int32"> & tags.Minimum<0>>(
      Math.ceil(total / limit),
    ),
  };

  return { pagination, data };
}
