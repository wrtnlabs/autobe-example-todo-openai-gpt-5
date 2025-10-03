import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ITodoMvpAuditEvent } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAuditEvent";
import { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import { IPageITodoMvpAuditEvent } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoMvpAuditEvent";
import { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import { IEAuditEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAuditEventType";
import { AdminPayload } from "../decorators/payload/AdminPayload";

export async function patchTodoMvpAdminAuditEvents(props: {
  admin: AdminPayload;
  body: ITodoMvpAuditEvent.IRequest;
}): Promise<IPageITodoMvpAuditEvent> {
  const { admin, body } = props;

  // Authorization: admin role + active and not soft-deleted
  if (!admin || admin.type !== "admin") {
    throw new HttpException("Forbidden: Admin role required", 403);
  }
  const adminRow = await MyGlobal.prisma.todo_mvp_admins.findFirst({
    where: {
      id: admin.id,
      status: "active",
      deleted_at: null,
    },
    select: { id: true },
  });
  if (adminRow === null) {
    throw new HttpException("Forbidden: Admin not found or inactive", 403);
  }

  // Pagination defaults and safety
  const page = Math.max(1, Number(body.page ?? 1));
  const limit = Math.max(1, Math.min(200, Number(body.limit ?? 20)));
  const skip = (page - 1) * limit;

  // Sorting controls
  const sortBy: "created_at" | "updated_at" = body.sort_by ?? "created_at";
  const orderDir: IEOrderDirection = body.order ?? "desc";

  // Build WHERE condition (soft-delete excluded by default)
  const where = {
    deleted_at: null,
    ...(body.actor_user_id !== undefined &&
      body.actor_user_id !== null && {
        todo_mvp_user_id: body.actor_user_id,
      }),
    ...(body.actor_admin_id !== undefined &&
      body.actor_admin_id !== null && {
        todo_mvp_admin_id: body.actor_admin_id,
      }),
    ...(body.target_todo_id !== undefined &&
      body.target_todo_id !== null && {
        todo_mvp_todo_id: body.target_todo_id,
      }),
    ...(body.event_types !== undefined &&
      body.event_types !== null && {
        event_type: { in: body.event_types },
      }),
    ...(((body.created_from !== undefined && body.created_from !== null) ||
      (body.created_to !== undefined && body.created_to !== null)) && {
      created_at: {
        ...(body.created_from !== undefined &&
          body.created_from !== null && {
            gte: toISOStringSafe(body.created_from),
          }),
        ...(body.created_to !== undefined &&
          body.created_to !== null && {
            lte: toISOStringSafe(body.created_to),
          }),
      },
    }),
  };

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_mvp_audit_events.findMany({
      where,
      orderBy:
        sortBy === "updated_at"
          ? { updated_at: orderDir }
          : { created_at: orderDir },
      skip,
      take: limit,
      select: {
        id: true,
        todo_mvp_user_id: true,
        todo_mvp_admin_id: true,
        todo_mvp_todo_id: true,
        event_type: true,
        event_description: true,
        created_at: true,
        updated_at: true,
        deleted_at: true,
      },
    }),
    MyGlobal.prisma.todo_mvp_audit_events.count({ where }),
  ]);

  const data: ITodoMvpAuditEvent[] = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    todo_mvp_user_id:
      r.todo_mvp_user_id === null
        ? null
        : (r.todo_mvp_user_id as string & tags.Format<"uuid">),
    todo_mvp_admin_id:
      r.todo_mvp_admin_id === null
        ? null
        : (r.todo_mvp_admin_id as string & tags.Format<"uuid">),
    todo_mvp_todo_id:
      r.todo_mvp_todo_id === null
        ? null
        : (r.todo_mvp_todo_id as string & tags.Format<"uuid">),
    event_type: r.event_type as IEAuditEventType,
    event_description: r.event_description ?? null,
    created_at: toISOStringSafe(r.created_at),
    updated_at: toISOStringSafe(r.updated_at),
    deleted_at: r.deleted_at ? toISOStringSafe(r.deleted_at) : null,
  }));

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: Number(total),
      pages: Number(limit > 0 ? Math.ceil(total / limit) : 0),
    },
    data,
  };
}
