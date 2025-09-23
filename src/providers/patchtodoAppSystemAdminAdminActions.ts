import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppAdminAction } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAdminAction";
import { IPageITodoAppAdminAction } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppAdminAction";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

export async function patchtodoAppSystemAdminAdminActions(props: {
  systemAdmin: SystemadminPayload;
  body: ITodoAppAdminAction.IRequest;
}): Promise<IPageITodoAppAdminAction.ISummary> {
  const { systemAdmin, body } = props;

  // Authorization: ensure systemAdmin role is active and valid
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
    throw new HttpException("Forbidden: System admin membership required", 403);
  }

  // Pagination defaults and validation
  const pageNum = Math.max(1, Number(body.page ?? 1));
  const limitNum = Number(body.limit ?? 20);
  if (limitNum < 1 || limitNum > 100) {
    throw new HttpException(
      "Bad Request: limit must be between 1 and 100",
      400,
    );
  }

  // Sorting defaults and normalization
  const orderByField = (body.orderBy ??
    "created_at") as ITodoAppAdminAction.EOrderBy;
  const orderDirection = (body.orderDirection ?? "desc") as "asc" | "desc";

  // Base where conditions (soft-delete aware)
  const baseWhere = {
    deleted_at: null,
    ...(body.admin_user_id !== undefined &&
      body.admin_user_id !== null && {
        admin_user_id: body.admin_user_id,
      }),
    ...(body.target_user_id !== undefined &&
      body.target_user_id !== null && {
        target_user_id: body.target_user_id,
      }),
    ...(body.action !== undefined &&
      body.action !== null &&
      body.action.length > 0 && {
        action: { contains: body.action },
      }),
    ...(body.success !== undefined &&
      body.success !== null && {
        success: body.success,
      }),
    ...((body.created_at_from !== undefined && body.created_at_from !== null) ||
    (body.created_at_to !== undefined && body.created_at_to !== null)
      ? {
          created_at: {
            ...(body.created_at_from !== undefined &&
              body.created_at_from !== null && {
                gte: body.created_at_from,
              }),
            ...(body.created_at_to !== undefined &&
              body.created_at_to !== null && {
                lte: body.created_at_to,
              }),
          },
        }
      : {}),
  } as const;

  const whereCondition =
    body.q !== undefined && body.q !== null && body.q.length > 0
      ? {
          AND: [
            baseWhere,
            {
              OR: [
                { reason: { contains: body.q } },
                { notes: { contains: body.q } },
              ],
            },
          ],
        }
      : baseWhere;

  const skip = (pageNum - 1) * limitNum;

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_app_admin_actions.findMany({
      where: whereCondition,
      select: {
        id: true,
        admin_user_id: true,
        target_user_id: true,
        action: true,
        success: true,
        created_at: true,
      },
      orderBy:
        orderByField === "action"
          ? { action: orderDirection }
          : orderByField === "success"
            ? { success: orderDirection }
            : { created_at: orderDirection },
      skip: skip,
      take: limitNum,
    }),
    MyGlobal.prisma.todo_app_admin_actions.count({ where: whereCondition }),
  ]);

  const data = rows.map((row) => ({
    id: row.id as string & tags.Format<"uuid">,
    admin_user_id: row.admin_user_id as string & tags.Format<"uuid">,
    target_user_id:
      row.target_user_id === null
        ? null
        : (row.target_user_id as string & tags.Format<"uuid">),
    action: row.action,
    success: row.success,
    created_at: toISOStringSafe(row.created_at),
  }));

  const pages = limitNum === 0 ? 0 : Math.ceil(total / limitNum);

  return {
    pagination: {
      current: Number(pageNum),
      limit: Number(limitNum),
      records: Number(total),
      pages: Number(pages),
    },
    data,
  };
}
