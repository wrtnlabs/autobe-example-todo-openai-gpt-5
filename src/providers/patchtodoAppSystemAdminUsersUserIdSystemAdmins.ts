import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import { IPageITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppSystemAdmin";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Search and paginate systemAdmin role assignment history for a user
 * (todo_app_systemadmins).
 *
 * Lists grant/revoke history entries for the systemAdmin role of a specified
 * user. Results are filtered to the path user's records, exclude soft-deleted
 * rows, and support pagination, sorting, and date range filters. Only
 * authenticated system administrators may access this endpoint.
 *
 * Authorization: Caller must be a system administrator. Non-admin callers are
 * forbidden regardless of target user.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator payload
 * @param props.userId - Target user ID whose admin role history is requested
 * @param props.body - Search, sort, and pagination parameters
 * @returns Paginated list of systemAdmin role assignment summaries
 * @throws {HttpException} 403 when the caller is not a system administrator
 */
export async function patchtodoAppSystemAdminUsersUserIdSystemAdmins(props: {
  systemAdmin: SystemadminPayload;
  userId: string & tags.Format<"uuid">;
  body: ITodoAppSystemAdmin.IRequest;
}): Promise<IPageITodoAppSystemAdmin.ISummary> {
  const { systemAdmin, userId, body } = props;

  // Authorization: ensure caller is system admin
  if (!systemAdmin || systemAdmin.type !== "systemadmin") {
    throw new HttpException(
      "Forbidden: System administrator privileges required",
      403,
    );
  }

  // Pagination defaults and safety clamps
  const rawPage = body.page ?? 1;
  const rawLimit = body.limit ?? 20;
  const page = Number(rawPage) >= 1 ? Number(rawPage) : 1;
  const limit = Math.max(1, Math.min(100, Number(rawLimit)));
  const skip = (page - 1) * limit;

  // Sorting: default by granted_at desc
  const sortField = (body.sort ?? "granted_at") as
    | "granted_at"
    | "revoked_at"
    | "created_at"
    | "updated_at";
  const direction = (body.direction ?? "desc") === "asc" ? "asc" : "desc";

  // Build where condition (soft-deleted excluded, scoped to target user)
  const whereCondition = {
    deleted_at: null,
    todo_app_user_id: userId,
    // Active-only filter: revoked_at IS NULL
    ...(body.activeOnly ? { revoked_at: null } : {}),
    // granted_at range
    ...((body.granted_from !== undefined && body.granted_from !== null) ||
    (body.granted_to !== undefined && body.granted_to !== null)
      ? {
          granted_at: {
            ...(body.granted_from !== undefined &&
              body.granted_from !== null && { gte: body.granted_from }),
            ...(body.granted_to !== undefined &&
              body.granted_to !== null && { lte: body.granted_to }),
          },
        }
      : {}),
    // revoked_at range (only when not forcing activeOnly)
    ...(!body.activeOnly &&
    ((body.revoked_from !== undefined && body.revoked_from !== null) ||
      (body.revoked_to !== undefined && body.revoked_to !== null))
      ? {
          revoked_at: {
            ...(body.revoked_from !== undefined &&
              body.revoked_from !== null && { gte: body.revoked_from }),
            ...(body.revoked_to !== undefined &&
              body.revoked_to !== null && { lte: body.revoked_to }),
          },
        }
      : {}),
    // created_at range
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
    // updated_at range
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
  };

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_systemadmins.findMany({
      where: whereCondition,
      select: {
        id: true,
        todo_app_user_id: true,
        granted_at: true,
        revoked_at: true,
      },
      orderBy:
        sortField === "granted_at"
          ? { granted_at: direction }
          : sortField === "revoked_at"
            ? { revoked_at: direction }
            : sortField === "created_at"
              ? { created_at: direction }
              : { updated_at: direction },
      skip,
      take: limit,
    }),
    MyGlobal.prisma.todo_app_systemadmins.count({
      where: whereCondition,
    }),
  ]);

  const data: ITodoAppSystemAdmin.ISummary[] = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    todo_app_user_id: r.todo_app_user_id as string & tags.Format<"uuid">,
    granted_at: toISOStringSafe(r.granted_at),
    revoked_at: r.revoked_at ? toISOStringSafe(r.revoked_at) : null,
  }));

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: total,
      pages: Math.ceil(total / limit),
    },
    data,
  };
}
