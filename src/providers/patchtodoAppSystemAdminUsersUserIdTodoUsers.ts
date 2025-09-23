import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import { IPageITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppTodoUser";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

export async function patchtodoAppSystemAdminUsersUserIdTodoUsers(props: {
  systemAdmin: SystemadminPayload;
  userId: string & tags.Format<"uuid">;
  body: ITodoAppTodoUser.IRequest;
}): Promise<IPageITodoAppTodoUser.ISummary> {
  /**
   * Search and paginate todoUser role assignment history for a user
   * (todo_app_todousers).
   *
   * Lists grant/revoke history rows for the todoUser role belonging to the
   * specified user. Supports pagination, sorting, and time-range filters. Only
   * accessible to system administrators. Soft-deleted rows are excluded.
   *
   * @param props - Request properties
   * @param props.systemAdmin - Authenticated system administrator payload
   * @param props.userId - Owner user's UUID whose role history is listed
   * @param props.body - Filters and pagination options
   * @returns Paginated list of todoUser role assignment summary records
   * @throws {HttpException} 403 when caller lacks system admin privileges
   * @throws {HttpException} 404 when the target user does not exist
   */
  const { systemAdmin, userId, body } = props;

  // Authorization: ensure caller is an active system admin
  const adminMembership = await MyGlobal.prisma.todo_app_systemadmins.findFirst(
    {
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
      select: { id: true },
    },
  );
  if (!adminMembership) throw new HttpException("Forbidden", 403);

  // Validate target user existence (and not soft-deleted)
  const userExists = await MyGlobal.prisma.todo_app_users.findUnique({
    where: { id: userId },
    select: { id: true, deleted_at: true },
  });
  if (!userExists || userExists.deleted_at !== null) {
    throw new HttpException("Not Found", 404);
  }

  // Pagination and sorting defaults
  const pageInput = body.page ?? 1;
  const limitInput = body.limit ?? 20;
  const page = pageInput < 1 ? 1 : pageInput;
  const limit = limitInput < 1 ? 1 : limitInput > 100 ? 100 : limitInput;
  const skip = (Number(page) - 1) * Number(limit);
  const take = Number(limit);

  const sortField: "granted_at" | "revoked_at" | "created_at" | "updated_at" =
    body.sort ?? "granted_at";
  const sortDirection: "asc" | "desc" = body.direction ?? "desc";

  // WHERE condition builder
  const whereCondition = {
    deleted_at: null,
    todo_app_user_id: userId,
    // Active-only filter
    ...(body.activeOnly === true ? { revoked_at: null } : {}),
    // granted_at range
    ...((body.granted_from !== undefined && body.granted_from !== null) ||
    (body.granted_to !== undefined && body.granted_to !== null)
      ? {
          granted_at: {
            ...(body.granted_from !== undefined &&
              body.granted_from !== null && {
                gte: body.granted_from,
              }),
            ...(body.granted_to !== undefined &&
              body.granted_to !== null && {
                lte: body.granted_to,
              }),
          },
        }
      : {}),
    // revoked_at range (only when not forcing active-only)
    ...(body.activeOnly !== true &&
    ((body.revoked_from !== undefined && body.revoked_from !== null) ||
      (body.revoked_to !== undefined && body.revoked_to !== null))
      ? {
          revoked_at: {
            ...(body.revoked_from !== undefined &&
              body.revoked_from !== null && {
                gte: body.revoked_from,
              }),
            ...(body.revoked_to !== undefined &&
              body.revoked_to !== null && {
                lte: body.revoked_to,
              }),
          },
        }
      : {}),
    // created_at range
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
    // updated_at range
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
  };

  const orderBy =
    sortField === "granted_at"
      ? { granted_at: sortDirection }
      : sortField === "revoked_at"
        ? { revoked_at: sortDirection }
        : sortField === "created_at"
          ? { created_at: sortDirection }
          : { updated_at: sortDirection };

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_todousers.findMany({
      where: whereCondition,
      orderBy,
      skip,
      take,
      select: {
        id: true,
        todo_app_user_id: true,
        granted_at: true,
        revoked_at: true,
      },
    }),
    MyGlobal.prisma.todo_app_todousers.count({ where: whereCondition }),
  ]);

  const data = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    todo_app_user_id: r.todo_app_user_id as string & tags.Format<"uuid">,
    granted_at: toISOStringSafe(r.granted_at),
    revoked_at: r.revoked_at ? toISOStringSafe(r.revoked_at) : null,
  }));

  const pages = Number(limit) === 0 ? 0 : Math.ceil(total / Number(limit));

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: Number(total),
      pages: Number(pages),
    },
    data,
  };
}
