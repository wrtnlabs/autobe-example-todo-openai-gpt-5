import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppGuestVisitor";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Get details of a guestVisitor assignment (todo_app_guestvisitors) for a
 * specific user.
 *
 * Retrieves a single guestVisitor role assignment record by its identifier
 * while scoping to the provided userId. Ensures the caller is an active system
 * administrator and the record belongs to the specified user. Soft-deleted
 * records are not returned.
 *
 * Authorization: systemAdmin only. The function verifies active admin
 * membership (not revoked, not deleted) and an active, verified owning user
 * account.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system admin payload
 * @param props.userId - Owner user’s UUID to scope the assignment
 * @param props.guestVisitorId - Guest visitor assignment record UUID
 * @returns The guestVisitor assignment record with full details
 * @throws {HttpException} 403 when caller is not an active system admin
 * @throws {HttpException} 404 when the record is not found or does not belong
 *   to the user
 */
export async function gettodoAppSystemAdminUsersUserIdGuestVisitorsGuestVisitorId(props: {
  systemAdmin: SystemadminPayload;
  userId: string & tags.Format<"uuid">;
  guestVisitorId: string & tags.Format<"uuid">;
}): Promise<ITodoAppGuestVisitor> {
  const { systemAdmin, userId, guestVisitorId } = props;

  // Authorization: verify active system admin membership and valid owning user state
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

  // Fetch the guestVisitor assignment scoped to the specific user and not soft-deleted
  const row = await MyGlobal.prisma.todo_app_guestvisitors
    .findFirstOrThrow({
      where: {
        id: guestVisitorId,
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
        deleted_at: true,
      },
    })
    .catch(() => {
      throw new HttpException("Not Found", 404);
    });

  // Build response with proper ISO date-time conversions
  return {
    id: row.id as string & tags.Format<"uuid">,
    todo_app_user_id: row.todo_app_user_id as string & tags.Format<"uuid">,
    granted_at: toISOStringSafe(row.granted_at),
    revoked_at: row.revoked_at ? toISOStringSafe(row.revoked_at) : null,
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
    deleted_at: row.deleted_at ? toISOStringSafe(row.deleted_at) : null,
  };
}
