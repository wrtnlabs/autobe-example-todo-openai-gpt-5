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

export async function patchtodoAppSystemAdminFeatureFlags(props: {
  systemAdmin: SystemadminPayload;
  body: ITodoAppFeatureFlag.IRequest;
}): Promise<IPageITodoAppFeatureFlag.ISummary> {
  const { systemAdmin, body } = props;

  // Authorization: ensure requester is an active system admin
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
    throw new HttpException("Forbidden: System admin privileges required", 403);
  }

  // Pagination defaults and validation
  const rawPage = body.page ?? 1;
  const rawLimit = body.limit ?? 20;
  if (rawPage !== null && rawPage !== undefined && rawPage < 1) {
    throw new HttpException("Bad Request: page must be >= 1", 400);
  }
  if (
    (rawLimit !== null && rawLimit !== undefined && rawLimit < 1) ||
    (rawLimit !== null && rawLimit !== undefined && rawLimit > 100)
  ) {
    throw new HttpException(
      "Bad Request: limit must be between 1 and 100",
      400,
    );
  }
  const page = Number(rawPage ?? 1);
  const limit = Number(rawLimit ?? 20);

  // Validate rollout range
  const rmin = body.rollout_min ?? undefined;
  const rmax = body.rollout_max ?? undefined;
  if (rmin !== undefined && (rmin < 0 || rmin > 100)) {
    throw new HttpException(
      "Bad Request: rollout_min must be between 0 and 100",
      400,
    );
  }
  if (rmax !== undefined && (rmax < 0 || rmax > 100)) {
    throw new HttpException(
      "Bad Request: rollout_max must be between 0 and 100",
      400,
    );
  }
  if (rmin !== undefined && rmax !== undefined && rmin > rmax) {
    throw new HttpException(
      "Bad Request: rollout_min cannot be greater than rollout_max",
      400,
    );
  }

  // Validate time windows (start_at, end_at, created_at, updated_at)
  const validateWindow = (
    from?: (string & tags.Format<"date-time">) | null,
    to?: (string & tags.Format<"date-time">) | null,
    label?: string,
  ): void => {
    if (
      from !== undefined &&
      to !== undefined &&
      from !== null &&
      to !== null
    ) {
      if (new Date(from).getTime() > new Date(to).getTime()) {
        throw new HttpException(
          `Bad Request: ${label ?? "time window"} start is after end`,
          400,
        );
      }
    }
  };
  validateWindow(body.start_from, body.start_to, "start_at window");
  validateWindow(body.end_from, body.end_to, "end_at window");
  validateWindow(body.created_from, body.created_to, "created_at window");
  validateWindow(body.updated_from, body.updated_to, "updated_at window");

  // Build where condition
  const nowIso = toISOStringSafe(new Date());
  const where = {
    deleted_at: null,
    ...(body.namespace !== undefined &&
      body.namespace !== null && {
        namespace: body.namespace,
      }),
    ...(body.environment !== undefined && {
      // If null explicitly provided, filter for environment IS NULL
      environment: body.environment === null ? null : body.environment,
    }),
    ...(body.code !== undefined && body.code !== null && { code: body.code }),
    ...(body.name !== undefined && body.name !== null && { name: body.name }),
    ...(body.active !== undefined &&
      body.active !== null && {
        active: body.active,
      }),
    ...(rmin !== undefined || rmax !== undefined
      ? {
          rollout_percentage: {
            ...(rmin !== undefined && { gte: rmin }),
            ...(rmax !== undefined && { lte: rmax }),
          },
        }
      : {}),
    ...((body.start_from !== undefined && body.start_from !== null) ||
    (body.start_to !== undefined && body.start_to !== null)
      ? {
          start_at: {
            ...(body.start_from !== undefined &&
              body.start_from !== null && {
                gte: body.start_from,
              }),
            ...(body.start_to !== undefined &&
              body.start_to !== null && {
                lte: body.start_to,
              }),
          },
        }
      : {}),
    ...((body.end_from !== undefined && body.end_from !== null) ||
    (body.end_to !== undefined && body.end_to !== null)
      ? {
          end_at: {
            ...(body.end_from !== undefined &&
              body.end_from !== null && {
                gte: body.end_from,
              }),
            ...(body.end_to !== undefined &&
              body.end_to !== null && {
                lte: body.end_to,
              }),
          },
        }
      : {}),
    ...((body.created_from !== undefined && body.created_from !== null) ||
    (body.created_to !== undefined && body.created_to !== null)
      ? {
          created_at: {
            ...(body.created_from !== undefined &&
              body.created_from !== null && {
                gte: body.created_from,
              }),
            ...(body.created_to !== undefined &&
              body.created_to !== null && {
                lte: body.created_to,
              }),
          },
        }
      : {}),
    ...((body.updated_from !== undefined && body.updated_from !== null) ||
    (body.updated_to !== undefined && body.updated_to !== null)
      ? {
          updated_at: {
            ...(body.updated_from !== undefined &&
              body.updated_from !== null && {
                gte: body.updated_from,
              }),
            ...(body.updated_to !== undefined &&
              body.updated_to !== null && {
                lte: body.updated_to,
              }),
          },
        }
      : {}),
    ...(body.search !== undefined &&
    body.search !== null &&
    body.search.trim().length > 0
      ? {
          OR: [
            { code: { contains: body.search } },
            { name: { contains: body.search } },
            { description: { contains: body.search } },
          ],
        }
      : {}),
    ...(body.effective_now_only
      ? {
          AND: [
            { active: true },
            { OR: [{ start_at: null }, { start_at: { lte: nowIso } }] },
            { OR: [{ end_at: null }, { end_at: { gt: nowIso } }] },
          ],
        }
      : {}),
  };

  // Sorting
  const orderField = body.order_by ?? "created_at";
  const orderDir = body.order_dir ?? "desc";

  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_feature_flags.findMany({
      where,
      orderBy: {
        [orderField]: orderDir,
      },
      skip,
      take: limit,
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
    }),
    MyGlobal.prisma.todo_app_feature_flags.count({ where }),
  ]);

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: Number(total),
      pages: Number(Math.ceil(total / limit)),
    },
    data: rows.map((r) => ({
      id: r.id as string & tags.Format<"uuid">,
      todo_app_service_policy_id:
        r.todo_app_service_policy_id === null
          ? null
          : (r.todo_app_service_policy_id as string & tags.Format<"uuid">),
      namespace: r.namespace,
      environment: r.environment ?? null,
      code: r.code,
      name: r.name,
      active: r.active,
      rollout_percentage: r.rollout_percentage as number &
        tags.Type<"int32"> &
        tags.Minimum<0> &
        tags.Maximum<100>,
      target_audience: r.target_audience ?? null,
      start_at: r.start_at ? toISOStringSafe(r.start_at) : null,
      end_at: r.end_at ? toISOStringSafe(r.end_at) : null,
      created_at: toISOStringSafe(r.created_at),
      updated_at: toISOStringSafe(r.updated_at),
    })),
  };
}
