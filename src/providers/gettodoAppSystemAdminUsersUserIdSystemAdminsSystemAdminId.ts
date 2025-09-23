import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

export async function gettodoAppSystemAdminUsersUserIdSystemAdminsSystemAdminId(props: {
  systemAdmin: SystemadminPayload;
  userId: string & tags.Format<"uuid">;
  systemAdminId: string & tags.Format<"uuid">;
}): Promise<ITodoAppSystemAdmin> {
  /**
   * Get one systemAdmin role assignment record for a user
   * (todo_app_systemadmins).
   *
   * Retrieves a single historical systemAdmin role assignment entry by its id,
   * scoped to the specified owner userId. Only available to authenticated
   * system administrators. Excludes soft-deleted records.
   *
   * Authorization: Caller must be a system admin with an active, non-revoked
   * assignment and an active, verified user account.
   *
   * @param props - Request properties
   * @param props.systemAdmin - Authenticated system administrator payload
   * @param props.userId - Owner user’s UUID to which the assignment must belong
   * @param props.systemAdminId - UUID of the systemAdmin role assignment record
   * @returns Detailed systemAdmin role assignment record
   * @throws {HttpException} 403 when caller lacks systemAdmin privileges
   * @throws {HttpException} 404 when the record is not found or mismatched
   */
  const { systemAdmin, userId, systemAdminId } = props;

  // Authorization: ensure caller is a system administrator
  if (!systemAdmin || systemAdmin.type !== "systemadmin") {
    throw new HttpException("Forbidden", 403);
  }

  // Verify active systemAdmin membership for the caller (revoked_at/deleted_at null)
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
    select: { id: true },
  });
  if (!membership) {
    throw new HttpException("Forbidden", 403);
  }

  // Fetch the assignment by id, ensuring ownership and not soft-deleted
  const found = await MyGlobal.prisma.todo_app_systemadmins.findFirst({
    where: {
      id: systemAdminId,
      todo_app_user_id: userId,
      deleted_at: null,
    },
    select: {
      id: true,
      todo_app_user_id: true,
      granted_at: true,
      revoked_at: true,
      created_at: true,
      updated_at: true,
    },
  });

  if (!found) {
    throw new HttpException("Not Found", 404);
  }

  // Map to DTO with proper ISO date conversions
  return {
    id: systemAdminId,
    todo_app_user_id: userId,
    granted_at: toISOStringSafe(found.granted_at),
    revoked_at: found.revoked_at ? toISOStringSafe(found.revoked_at) : null,
    created_at: toISOStringSafe(found.created_at),
    updated_at: toISOStringSafe(found.updated_at),
  };
}
