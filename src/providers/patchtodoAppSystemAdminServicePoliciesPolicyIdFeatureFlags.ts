import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppFeatureFlag } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppFeatureFlag";
import { IPageITodoAppFeatureFlag } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppFeatureFlag";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

export async function patchtodoAppSystemAdminServicePoliciesPolicyIdFeatureFlags(props: {
  systemAdmin: SystemadminPayload;
  policyId: string & tags.Format<"uuid">;
  body: ITodoAppFeatureFlag.IRequest;
}): Promise<IPageITodoAppFeatureFlag.ISummary> {
  /**
   * Search and paginate feature flags (todo_app_feature_flags) under a policy.
   *
   * Retrieves a filtered, sorted, and paginated list of feature flags scoped by
   * the given policyId. Supports substring search (code/name/description),
   * equality filters (namespace/environment/active/code/name), rollout range,
   * time window constraints (start_at/end_at/created_at/updated_at), and an
   * "effective now" filter. Excludes soft-deleted rows by default.
   *
   * Authorization: system administrators only. Also validates the policy
   * exists.
   *
   * @param props - Request properties
   * @param props.systemAdmin - The authenticated system admin making the
   *   request
   * @param props.policyId - UUID of service policy to scope feature flags
   * @param props.body - Filters, sorting, and pagination parameters
   * @returns Paginated list of feature flag summaries
   * @throws {HttpException} 403 when requester is not an active system admin
   * @throws {HttpException} 404 when policy does not exist
   * @throws {HttpException} 400 for invalid range filters
   */
  const { systemAdmin, policyId, body } = props;

  // Authorization: ensure caller is an active system admin and owning user is valid
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
    throw new HttpException(
      "Unauthorized: System admin membership required",
      403,
    );
  }

  // Ensure policy exists (and not soft-deleted)
  const policy = await MyGlobal.prisma.todo_app_service_policies.findFirst({
    where: { id: policyId, deleted_at: null },
    select: { id: true },
  });
  if (!policy) {
    throw new HttpException("Not Found: Policy does not exist", 404);
  }

  // Validate ranges
  const invalidPercentRange =
    body.rollout_min !== undefined &&
    body.rollout_min !== null &&
    body.rollout_max !== undefined &&
    body.rollout_max !== null &&
    Number(body.rollout_min) > Number(body.rollout_max);
  if (invalidPercentRange) {
    throw new HttpException(
      "Bad Request: rollout_min cannot exceed rollout_max",
      400,
    );
  }
  const compareIso = (
    a?: (string & tags.Format<"date-time">) | null,
    b?: (string & tags.Format<"date-time">) | null,
  ) => a !== undefined && a !== null && b !== undefined && b !== null && a > b;
  if (compareIso(body.start_from ?? null, body.start_to ?? null)) {
    throw new HttpException(
      "Bad Request: start_from cannot exceed start_to",
      400,
    );
  }
  if (compareIso(body.end_from ?? null, body.end_to ?? null)) {
    throw new HttpException("Bad Request: end_from cannot exceed end_to", 400);
  }
  if (compareIso(body.created_from ?? null, body.created_to ?? null)) {
    throw new HttpException(
      "Bad Request: created_from cannot exceed created_to",
      400,
    );
  }
  if (compareIso(body.updated_from ?? null, body.updated_to ?? null)) {
    throw new HttpException(
      "Bad Request: updated_from cannot exceed updated_to",
      400,
    );
  }

  // Pagination defaults and clamping
  const page =
    body.page !== undefined && body.page !== null ? Number(body.page) : 1;
  const limitRaw =
    body.limit !== undefined && body.limit !== null ? Number(body.limit) : 20;
  const limit = Math.min(Math.max(limitRaw, 1), 100);
  const skip = (page - 1) * limit;

  // Sorting
  const orderByField = body.order_by ?? "created_at";
  const orderDir = body.order_dir ?? "desc";

  // Effective-now filter values
  const nowIso = toISOStringSafe(new Date());

  // Build where condition (allowed to extract for readability)
  const whereCondition = {
    deleted_at: null,
    // Scope to policy
    todo_app_service_policy_id: policyId,

    // Simple equality filters
    ...(body.namespace !== undefined &&
      body.namespace !== null && {
        namespace: body.namespace,
      }),
    ...(body.environment !== undefined && {
      // null means filter records where environment IS NULL
      environment: body.environment,
    }),
    ...(body.code !== undefined && body.code !== null && { code: body.code }),
    ...(body.name !== undefined && body.name !== null && { name: body.name }),
    ...(body.active !== undefined &&
      body.active !== null && { active: body.active }),

    // Numeric range
    ...((body.rollout_min !== undefined && body.rollout_min !== null) ||
    (body.rollout_max !== undefined && body.rollout_max !== null)
      ? {
          rollout_percentage: {
            ...(body.rollout_min !== undefined &&
              body.rollout_min !== null && { gte: Number(body.rollout_min) }),
            ...(body.rollout_max !== undefined &&
              body.rollout_max !== null && { lte: Number(body.rollout_max) }),
          },
        }
      : {}),

    // Time ranges
    ...((body.start_from !== undefined && body.start_from !== null) ||
    (body.start_to !== undefined && body.start_to !== null)
      ? {
          start_at: {
            ...(body.start_from !== undefined &&
              body.start_from !== null && { gte: body.start_from }),
            ...(body.start_to !== undefined &&
              body.start_to !== null && { lte: body.start_to }),
          },
        }
      : {}),
    ...((body.end_from !== undefined && body.end_from !== null) ||
    (body.end_to !== undefined && body.end_to !== null)
      ? {
          end_at: {
            ...(body.end_from !== undefined &&
              body.end_from !== null && { gte: body.end_from }),
            ...(body.end_to !== undefined &&
              body.end_to !== null && { lte: body.end_to }),
          },
        }
      : {}),
    ...((body.created_from !== undefined && body.created_from !== null) ||
    (body.created_to !== undefined && body.created_to !== null)
      ? {
          created_at: {
            ...(body.created_from !== undefined &&
              body.created_from !== null && { gte: body.created_from }),
            ...(body.created_to !== undefined &&
              body.created_to !== null && { lte: body.created_to }),
          },
        }
      : {}),
    ...((body.updated_from !== undefined && body.updated_from !== null) ||
    (body.updated_to !== undefined && body.updated_to !== null)
      ? {
          updated_at: {
            ...(body.updated_from !== undefined &&
              body.updated_from !== null && { gte: body.updated_from }),
            ...(body.updated_to !== undefined &&
              body.updated_to !== null && { lte: body.updated_to }),
          },
        }
      : {}),

    // Effective-now-only filter: active true and within window
    ...(body.effective_now_only
      ? {
          active: true,
          OR: [
            // No window => effective when active
            { AND: [{ start_at: null }, { end_at: null }] },
            // Started, no end yet
            { AND: [{ start_at: { lte: nowIso } }, { end_at: null }] },
            // No start, ends in future
            { AND: [{ start_at: null }, { end_at: { gte: nowIso } }] },
            // Between start and end
            {
              AND: [{ start_at: { lte: nowIso } }, { end_at: { gte: nowIso } }],
            },
          ],
        }
      : {}),

    // Search across code/name/description
    ...(body.search !== undefined &&
      body.search !== null &&
      body.search !== "" && {
        OR: [
          { code: { contains: body.search } },
          { name: { contains: body.search } },
          { description: { contains: body.search } },
        ],
      }),
  } as Record<string, unknown>;

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_feature_flags.findMany({
      where: whereCondition,
      select: {
        id: true,
        todo_app_service_policy_id: true,
        namespace: true,
        environment: true,
        code: true,
        name: true,
        active: true,
        rollout_percentage: true,
        target_audience: true,
        start_at: true,
        end_at: true,
        created_at: true,
        updated_at: true,
      },
      orderBy:
        orderByField === "updated_at"
          ? { updated_at: orderDir }
          : orderByField === "code"
            ? { code: orderDir }
            : orderByField === "name"
              ? { name: orderDir }
              : orderByField === "rollout_percentage"
                ? { rollout_percentage: orderDir }
                : orderByField === "start_at"
                  ? { start_at: orderDir }
                  : orderByField === "end_at"
                    ? { end_at: orderDir }
                    : { created_at: orderDir },
      skip,
      take: limit,
    }),
    MyGlobal.prisma.todo_app_feature_flags.count({ where: whereCondition }),
  ]);

  const data = rows.map((r) =>
    typia.assert<ITodoAppFeatureFlag.ISummary>({
      id: typia.assert<string & tags.Format<"uuid">>(r.id),
      todo_app_service_policy_id:
        r.todo_app_service_policy_id === null
          ? null
          : typia.assert<string & tags.Format<"uuid">>(
              r.todo_app_service_policy_id,
            ),
      namespace: r.namespace,
      environment: r.environment ?? null,
      code: r.code,
      name: r.name,
      active: r.active,
      rollout_percentage: typia.assert<
        number & tags.Type<"int32"> & tags.Minimum<0> & tags.Maximum<100>
      >(r.rollout_percentage),
      target_audience: r.target_audience ?? null,
      start_at: r.start_at ? toISOStringSafe(r.start_at) : null,
      end_at: r.end_at ? toISOStringSafe(r.end_at) : null,
      created_at: toISOStringSafe(r.created_at),
      updated_at: toISOStringSafe(r.updated_at),
    }),
  );

  const pages = limit > 0 ? Math.ceil(total / limit) : 0;

  return typia.assert<IPageITodoAppFeatureFlag.ISummary>({
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: Number(total),
      pages: Number(pages),
    },
    data,
  });
}
