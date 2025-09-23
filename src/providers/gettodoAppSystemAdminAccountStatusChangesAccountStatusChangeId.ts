import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppAccountStatusChange } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAccountStatusChange";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

export async function gettodoAppSystemAdminAccountStatusChangesAccountStatusChangeId(props: {
  systemAdmin: SystemadminPayload;
  accountStatusChangeId: string & tags.Format<"uuid">;
}): Promise<ITodoAppAccountStatusChange> {
  /**
   * Get details of one account status change (todo_app_account_status_changes)
   * by ID.
   *
   * Retrieves a single account lifecycle status change record identified by
   * accountStatusChangeId. Only system administrators are authorized to access
   * this endpoint. Returns lifecycle metadata including target account,
   * optional administrator actor, previous/new status, rationale, effect flag,
   * and audit timestamps.
   *
   * Authorization: systemAdmin only. This function verifies active, non-revoked
   * system admin membership and active/verified user state prior to data
   * access.
   *
   * @param props - Request properties
   * @param props.systemAdmin - The authenticated system administrator payload
   * @param props.accountStatusChangeId - UUID of the status change record to
   *   retrieve
   * @returns The detailed account status change entity
   * @throws {HttpException} 403 when not authorized as active system admin
   * @throws {HttpException} 404 when the record does not exist
   */
  const { systemAdmin, accountStatusChangeId } = props;

  // Authorization: ensure caller is an active, non-revoked system admin and owning user is active/verified
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
  if (!membership) throw new HttpException("Forbidden", 403);

  // Fetch the account status change record
  const record =
    await MyGlobal.prisma.todo_app_account_status_changes.findUnique({
      where: { id: accountStatusChangeId },
    });
  if (!record) throw new HttpException("Not Found", 404);

  // Build response with strict date conversions and UUID branding
  return {
    id: accountStatusChangeId,
    target_user_id: typia.assert<string & tags.Format<"uuid">>(
      record.target_user_id,
    ),
    admin_user_id:
      record.admin_user_id === null
        ? null
        : typia.assert<string & tags.Format<"uuid">>(record.admin_user_id),
    previous_status: record.previous_status,
    new_status: record.new_status,
    business_reason: record.business_reason ?? null,
    has_effect: record.has_effect,
    created_at: toISOStringSafe(record.created_at),
    updated_at: toISOStringSafe(record.updated_at),
    deleted_at: record.deleted_at ? toISOStringSafe(record.deleted_at) : null,
  };
}
