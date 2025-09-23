import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUser";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Get a user (todo_app_users) by ID
 *
 * Retrieves a single user account by UUID for administrative inspection.
 * Excludes sensitive secrets (e.g., password_hash) and returns only
 * business-relevant fields. Soft-deleted users (deleted_at set) are treated as
 * not found.
 *
 * Authorization: System administrators only. Verifies the requester is an
 * active, non-revoked systemAdmin.
 *
 * @param props - Request properties
 * @param props.systemAdmin - Authenticated system admin payload
 * @param props.userId - Target user's UUID
 * @returns The administrative user view (ITodoAppUser)
 * @throws {HttpException} 401/403 when not authorized
 * @throws {HttpException} 404 when user not found or soft-deleted
 */
export async function gettodoAppSystemAdminUsersUserId(props: {
  systemAdmin: SystemadminPayload;
  userId: string & tags.Format<"uuid">;
}): Promise<ITodoAppUser> {
  // Basic role check
  if (!props.systemAdmin || props.systemAdmin.type !== "systemadmin")
    throw new HttpException("Forbidden", 403);

  // Verify active systemAdmin membership
  const membership = await MyGlobal.prisma.todo_app_systemadmins.findFirst({
    where: {
      todo_app_user_id: props.systemAdmin.id,
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
  if (!membership) throw new HttpException("Forbidden", 403);

  // Fetch the target user, excluding soft-deleted
  const row = await MyGlobal.prisma.todo_app_users.findFirst({
    where: {
      id: props.userId,
      deleted_at: null,
    },
    select: {
      id: true,
      email: true,
      status: true,
      email_verified: true,
      verified_at: true,
      last_login_at: true,
      created_at: true,
      updated_at: true,
    },
  });

  if (!row) throw new HttpException("Not Found", 404);

  // Map to DTO with proper date-time conversions and branding
  return {
    id: row.id as string & tags.Format<"uuid">,
    email: row.email as string & tags.Format<"email">,
    status: row.status,
    email_verified: row.email_verified,
    verified_at: row.verified_at ? toISOStringSafe(row.verified_at) : null,
    last_login_at: row.last_login_at
      ? toISOStringSafe(row.last_login_at)
      : null,
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
  };
}
