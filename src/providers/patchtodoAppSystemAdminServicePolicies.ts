import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppServicePolicy";
import { IPageITodoAppServicePolicy } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppServicePolicy";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * List/search service policies (todo_app_service_policies) with filters and
 * pagination
 *
 * Returns paginated summaries of service policies filtered by namespace, code,
 * name/description substring matches, active flag, and effective window ranges.
 * Only accessible to system admins. Soft-deleted records are excluded by
 * default.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator payload
 * @param props.body - Search criteria, pagination, and sorting parameters
 * @returns Paginated collection of policy summaries matching the query
 * @throws {HttpException} 403 when the requester is not an active system admin
 * @throws {HttpException} 400 on invalid pagination values or malformed
 *   datetime ranges
 */
export async function patchtodoAppSystemAdminServicePolicies(props: {
  systemAdmin: SystemadminPayload;
  body: ITodoAppServicePolicy.IRequest;
}): Promise<IPageITodoAppServicePolicy.ISummary> {
  const { systemAdmin, body } = props;

  // Authorization: ensure requester is an active system admin and owning user is valid
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
  if (membership === null) {
    throw new HttpException("Forbidden: systemAdmin privileges required", 403);
  }

  // Pagination defaults and validation
  const page = Number(body.page ?? 1);
  const limit = Number(body.limit ?? 20);
  if (!(page >= 1)) {
    throw new HttpException("Bad Request: page must be >= 1", 400);
  }
  if (!(limit >= 1 && limit <= 100)) {
    throw new HttpException(
      "Bad Request: limit must be between 1 and 100",
      400,
    );
  }

  // Datetime range validation
  if (
    body.effective_from_from !== undefined &&
    body.effective_from_from !== null &&
    body.effective_from_to !== undefined &&
    body.effective_from_to !== null &&
    body.effective_from_from > body.effective_from_to
  ) {
    throw new HttpException(
      "Bad Request: effective_from_from must be <= effective_from_to",
      400,
    );
  }
  if (
    body.effective_to_from !== undefined &&
    body.effective_to_from !== null &&
    body.effective_to_to !== undefined &&
    body.effective_to_to !== null &&
    body.effective_to_from > body.effective_to_to
  ) {
    throw new HttpException(
      "Bad Request: effective_to_from must be <= effective_to_to",
      400,
    );
  }

  // Build where condition
  const whereCondition = {
    deleted_at: null,
    ...(body.namespace !== undefined &&
      body.namespace !== null && {
        namespace: body.namespace,
      }),
    ...(body.code !== undefined &&
      body.code !== null && {
        code: body.code,
      }),
    ...(body.active !== undefined &&
      body.active !== null && {
        active: body.active,
      }),
    ...(body.name_contains !== undefined &&
      body.name_contains !== null && {
        name: { contains: body.name_contains },
      }),
    ...(body.description_contains !== undefined &&
      body.description_contains !== null && {
        description: { contains: body.description_contains },
      }),
    ...(() => {
      const hasFrom =
        body.effective_from_from !== undefined &&
        body.effective_from_from !== null;
      const hasTo =
        body.effective_from_to !== undefined && body.effective_from_to !== null;
      if (!hasFrom && !hasTo) return {} as Record<string, unknown>;
      return {
        effective_from: {
          ...(hasFrom && { gte: body.effective_from_from! }),
          ...(hasTo && { lte: body.effective_from_to! }),
        },
      };
    })(),
    ...(() => {
      const hasFrom =
        body.effective_to_from !== undefined && body.effective_to_from !== null;
      const hasTo =
        body.effective_to_to !== undefined && body.effective_to_to !== null;
      if (!hasFrom && !hasTo) return {} as Record<string, unknown>;
      return {
        effective_to: {
          ...(hasFrom && { gte: body.effective_to_from! }),
          ...(hasTo && { lte: body.effective_to_to! }),
        },
      };
    })(),
  };

  // Sorting
  const sortField = body.sort ?? "created_at";
  const sortDirection = body.direction === "asc" ? "asc" : "desc";

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_service_policies.findMany({
      where: whereCondition,
      orderBy:
        sortField === "created_at"
          ? { created_at: sortDirection }
          : sortField === "updated_at"
            ? { updated_at: sortDirection }
            : sortField === "code"
              ? { code: sortDirection }
              : sortField === "name"
                ? { name: sortDirection }
                : { effective_from: sortDirection },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        namespace: true,
        code: true,
        name: true,
        active: true,
        effective_from: true,
        effective_to: true,
        created_at: true,
      },
    }),
    MyGlobal.prisma.todo_app_service_policies.count({ where: whereCondition }),
  ]);

  const data = rows.map((r) => ({
    id: r.id,
    namespace: r.namespace,
    code: r.code,
    name: r.name,
    active: r.active,
    effective_from: r.effective_from ? toISOStringSafe(r.effective_from) : null,
    effective_to: r.effective_to ? toISOStringSafe(r.effective_to) : null,
    created_at: toISOStringSafe(r.created_at),
  }));

  const records = total;
  const pages = Math.ceil(records / limit);

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: Number(records),
      pages: Number(pages),
    },
    data,
  };
}
