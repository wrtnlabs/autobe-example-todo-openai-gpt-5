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

export async function patchtodoAppSystemAdminServiceConfigurations(props: {
  systemAdmin: SystemadminPayload;
  body: ITodoAppServiceConfiguration.IRequest;
}): Promise<IPageITodoAppServiceConfiguration.ISummary> {
  /**
   * Search and paginate service configurations
   * (todo_app_service_configurations)
   *
   * Retrieves a filtered, sorted, paginated list of configuration summaries for
   * system administrators. Applies soft-delete exclusion, supports
   * namespace/environment filters, active state, value_type, free-text search
   * (key/description), and effective window intersection. Sensitive raw values
   * are never returned in summaries.
   *
   * Authorization: System Admin only. Validates active, non-revoked membership.
   *
   * @param props - Request properties
   * @param props.systemAdmin - The authenticated system admin payload
   * @param props.body - Search criteria, pagination, and sorting options
   * @returns Paginated collection of configuration summaries matching filters
   * @throws {HttpException} 401/403 when unauthorized
   * @throws {HttpException} 400 when pagination parameters are invalid
   */
  const { systemAdmin, body } = props;

  // Authorization: ensure active, non-revoked system admin membership
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
  if (membership === null) throw new HttpException("Forbidden", 403);

  // Pagination with bounds
  const page = Number(body.page ?? 1);
  const limit = Number(body.limit ?? 20);
  if (page < 1) throw new HttpException("Bad Request: page must be >= 1", 400);
  if (limit < 1 || limit > 100)
    throw new HttpException(
      "Bad Request: limit must be between 1 and 100",
      400,
    );

  // WHERE condition (soft-delete excluded by default)
  const whereCondition = {
    deleted_at: null,
    ...(body.namespace !== undefined &&
      body.namespace !== null && {
        namespace: body.namespace,
      }),
    ...(body.environment !== undefined && {
      // If explicitly null, filter for NULL environment rows; if string, filter equality
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
    ...(body.effective_at !== undefined && body.effective_at !== null
      ? {
          AND: [
            {
              OR: [
                { effective_from: null },
                { effective_from: { lte: body.effective_at } },
              ],
            },
            {
              OR: [
                { effective_to: null },
                { effective_to: { gte: body.effective_at } },
              ],
            },
          ],
        }
      : {}),
  } as const;

  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_service_configurations.findMany({
      where: whereCondition,
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
      orderBy:
        body.orderBy === "namespace"
          ? { namespace: body.order === "asc" ? "asc" : "desc" }
          : body.orderBy === "environment"
            ? { environment: body.order === "asc" ? "asc" : "desc" }
            : body.orderBy === "key"
              ? { key: body.order === "asc" ? "asc" : "desc" }
              : body.orderBy === "active"
                ? { active: body.order === "asc" ? "asc" : "desc" }
                : body.orderBy === "value_type"
                  ? { value_type: body.order === "asc" ? "asc" : "desc" }
                  : body.orderBy === "effective_from"
                    ? { effective_from: body.order === "asc" ? "asc" : "desc" }
                    : body.orderBy === "effective_to"
                      ? { effective_to: body.order === "asc" ? "asc" : "desc" }
                      : body.orderBy === "id"
                        ? { id: body.order === "asc" ? "asc" : "desc" }
                        : { created_at: body.order === "asc" ? "asc" : "desc" },
      skip,
      take: limit,
    }),
    MyGlobal.prisma.todo_app_service_configurations.count({
      where: whereCondition,
    }),
  ]);

  const data = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    todo_app_service_policy_id:
      r.todo_app_service_policy_id === null
        ? null
        : (r.todo_app_service_policy_id as string & tags.Format<"uuid">),
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

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: Number(total),
      pages: Math.ceil(Number(total) / Number(limit)),
    },
    data,
  };
}
