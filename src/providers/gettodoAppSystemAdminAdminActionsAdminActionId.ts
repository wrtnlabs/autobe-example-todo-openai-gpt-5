import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppAdminAction } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAdminAction";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

export async function gettodoAppSystemAdminAdminActionsAdminActionId(props: {
  systemAdmin: SystemadminPayload;
  adminActionId: string & tags.Format<"uuid">;
}): Promise<ITodoAppAdminAction> {
  const { systemAdmin, adminActionId } = props;

  // Authorization: ensure caller is an active, non-revoked system admin
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
    throw new HttpException("Forbidden", 403);
  }

  // Fetch the admin action, excluding soft-deleted records
  const record = await MyGlobal.prisma.todo_app_admin_actions.findFirst({
    where: {
      id: adminActionId,
      deleted_at: null,
    },
  });
  if (record === null) {
    throw new HttpException("Not Found", 404);
  }

  // Map to API structure with proper date conversions and null handling
  return {
    id: record.id as string & tags.Format<"uuid">,
    admin_user_id: record.admin_user_id as string & tags.Format<"uuid">,
    target_user_id:
      record.target_user_id === null
        ? null
        : (record.target_user_id as string & tags.Format<"uuid">),
    action: record.action,
    reason: record.reason ?? null,
    notes: record.notes ?? null,
    success: record.success,
    idempotency_key: record.idempotency_key ?? null,
    created_at: toISOStringSafe(record.created_at),
    updated_at: toISOStringSafe(record.updated_at),
    deleted_at: record.deleted_at ? toISOStringSafe(record.deleted_at) : null,
  };
}
