import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ITodoMvpComplianceRemovalRecord } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpComplianceRemovalRecord";
import { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import { IPageITodoMvpComplianceRemovalRecord } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoMvpComplianceRemovalRecord";
import { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import { IEComplianceReasonCode } from "@ORGANIZATION/PROJECT-api/lib/structures/IEComplianceReasonCode";
import { AdminPayload } from "../decorators/payload/AdminPayload";

export async function patchTodoMvpAdminComplianceRemovalRecords(props: {
  admin: AdminPayload;
  body: ITodoMvpComplianceRemovalRecord.IRequest;
}): Promise<IPageITodoMvpComplianceRemovalRecord> {
  const { admin, body } = props;

  // Authorization: ensure admin exists, active, not soft-deleted
  const adminCheck = await MyGlobal.prisma.todo_mvp_admins.findFirst({
    where: {
      id: admin.id,
      status: "active",
      deleted_at: null,
    },
    select: { id: true },
  });
  if (!adminCheck) {
    throw new HttpException("Forbidden: Admin not found or inactive", 403);
  }

  // Pagination with defaults and clamping
  const pageRaw = body.page ?? 1;
  const limitRaw = body.limit ?? 20;
  const pageNum = Math.max(1, Number(pageRaw));
  const limitNum = Math.max(1, Math.min(200, Number(limitRaw)));
  const skip = (pageNum - 1) * limitNum;

  // Sorting defaults and whitelist
  const sortBy = body.sort_by ?? "created_at";
  const order = body.order ?? "desc";

  // Build where conditions (exclude soft-deleted)
  const where = {
    deleted_at: null,
    ...(body.actor_admin_id !== undefined &&
      body.actor_admin_id !== null && {
        todo_mvp_admin_id: body.actor_admin_id,
      }),
    ...(body.removed_todo_id !== undefined &&
      body.removed_todo_id !== null && {
        todo_mvp_todo_id: body.removed_todo_id,
      }),
    ...(body.reason_codes !== undefined &&
      body.reason_codes !== null &&
      body.reason_codes.length > 0 && {
        reason_code: { in: body.reason_codes },
      }),
    ...((body.effective_from !== undefined && body.effective_from !== null) ||
    (body.effective_to !== undefined && body.effective_to !== null)
      ? {
          action_effective_at: {
            ...(body.effective_from !== undefined &&
              body.effective_from !== null && {
                gte: body.effective_from,
              }),
            ...(body.effective_to !== undefined &&
              body.effective_to !== null && {
                lte: body.effective_to,
              }),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.todo_mvp_compliance_removal_records.findMany({
      where,
      orderBy:
        sortBy === "action_effective_at"
          ? { action_effective_at: order }
          : sortBy === "updated_at"
            ? { updated_at: order }
            : sortBy === "reason_code"
              ? { reason_code: order }
              : { created_at: order },
      skip,
      take: limitNum,
      select: {
        id: true,
        todo_mvp_admin_id: true,
        todo_mvp_todo_id: true,
        reason_code: true,
        notes: true,
        action_effective_at: true,
        created_at: true,
        updated_at: true,
        deleted_at: true,
      },
    }),
    MyGlobal.prisma.todo_mvp_compliance_removal_records.count({ where }),
  ]);

  const data: ITodoMvpComplianceRemovalRecord[] = rows.map((r) => ({
    id: typia.assert<string & tags.Format<"uuid">>(r.id),
    todo_mvp_admin_id:
      r.todo_mvp_admin_id !== null
        ? typia.assert<string & tags.Format<"uuid">>(r.todo_mvp_admin_id)
        : null,
    todo_mvp_todo_id:
      r.todo_mvp_todo_id !== null
        ? typia.assert<string & tags.Format<"uuid">>(r.todo_mvp_todo_id)
        : null,
    reason_code: typia.assert<IEComplianceReasonCode>(r.reason_code),
    notes: r.notes ?? null,
    action_effective_at: toISOStringSafe(r.action_effective_at),
    created_at: toISOStringSafe(r.created_at),
    updated_at: toISOStringSafe(r.updated_at),
    deleted_at: r.deleted_at ? toISOStringSafe(r.deleted_at) : null,
  }));

  const pagination: IPage.IPagination = {
    current: typia.assert<number & tags.Type<"int32"> & tags.Minimum<0>>(
      Number(pageNum),
    ),
    limit: typia.assert<number & tags.Type<"int32"> & tags.Minimum<0>>(
      Number(limitNum),
    ),
    records: typia.assert<number & tags.Type<"int32"> & tags.Minimum<0>>(
      Number(total),
    ),
    pages: typia.assert<number & tags.Type<"int32"> & tags.Minimum<0>>(
      Math.ceil(Number(total) / Math.max(1, Number(limitNum))),
    ),
  };

  return { pagination, data };
}
