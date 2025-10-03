import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ITodoMvpComplianceRemovalRecord } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpComplianceRemovalRecord";
import { IEComplianceReasonCode } from "@ORGANIZATION/PROJECT-api/lib/structures/IEComplianceReasonCode";
import { AdminPayload } from "../decorators/payload/AdminPayload";

/**
 * Get a compliance removal record (todo_mvp_compliance_removal_records) by ID
 *
 * Retrieves a single administrative compliance removal record by its UUID.
 * Access is restricted to authenticated admins. The record contains
 * privacy-preserving metadata (no Todo content), including reason_code,
 * optional notes, the effective action time, and optional links to the acting
 * admin and removed Todo.
 *
 * @param props - Request properties
 * @param props.admin - The authenticated admin making the request
 * @param props.complianceRemovalRecordId - UUID of the compliance removal
 *   record to retrieve
 * @returns The compliance removal record details for administrative oversight
 * @throws {HttpException} 403 when the admin is not active or is soft-deleted
 * @throws {HttpException} 404 when the record does not exist or is soft-deleted
 */
export async function getTodoMvpAdminComplianceRemovalRecordsComplianceRemovalRecordId(props: {
  admin: AdminPayload;
  complianceRemovalRecordId: string & tags.Format<"uuid">;
}): Promise<ITodoMvpComplianceRemovalRecord> {
  const { admin, complianceRemovalRecordId } = props;

  // Authorization: ensure admin exists, active, and not soft-deleted
  const adminRow = await MyGlobal.prisma.todo_mvp_admins.findFirst({
    where: {
      id: admin.id,
      status: "active",
      deleted_at: null,
    },
    select: { id: true },
  });
  if (adminRow === null) {
    throw new HttpException("Unauthorized: Admin not active or not found", 403);
  }

  // Fetch the compliance removal record (exclude soft-deleted ones)
  const record =
    await MyGlobal.prisma.todo_mvp_compliance_removal_records.findFirst({
      where: {
        id: complianceRemovalRecordId,
        deleted_at: null,
      },
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
    });

  if (record === null) {
    throw new HttpException("Not Found", 404);
  }

  // Validate reason_code against the enum type without using type assertions
  const reasonCode = typia.assert<IEComplianceReasonCode>(record.reason_code);

  return {
    id: record.id,
    todo_mvp_admin_id: record.todo_mvp_admin_id ?? undefined,
    todo_mvp_todo_id: record.todo_mvp_todo_id ?? undefined,
    reason_code: reasonCode,
    notes: record.notes ?? undefined,
    action_effective_at: toISOStringSafe(record.action_effective_at),
    created_at: toISOStringSafe(record.created_at),
    updated_at: toISOStringSafe(record.updated_at),
    deleted_at: record.deleted_at
      ? toISOStringSafe(record.deleted_at)
      : undefined,
  };
}
