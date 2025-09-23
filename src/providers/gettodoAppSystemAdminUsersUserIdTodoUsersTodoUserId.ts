import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Get one todoUser role assignment record for a user (todo_app_todousers).
 *
 * Retrieves a specific role-assignment history entry by its identifier, scoped
 * to the provided owner userId. Only system administrators may access this
 * endpoint. The record is excluded when soft-deleted.
 *
 * Authorization: Confirms the caller is an active system administrator with an
 * active, verified owning user account. If not authorized, responds 403. If the
 * record does not exist or is not associated with the given userId, responds
 * 404 without leaking cross-user information.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator payload
 * @param props.userId - Owner user’s UUID whose assignment is queried
 * @param props.todoUserId - Role-assignment record UUID to retrieve
 * @returns Detailed todoUser role assignment record
 * @throws {HttpException} 403 when forbidden
 * @throws {HttpException} 404 when not found
 */
export async function gettodoAppSystemAdminUsersUserIdTodoUsersTodoUserId(props: {
  systemAdmin: SystemadminPayload;
  userId: string & tags.Format<"uuid">;
  todoUserId: string & tags.Format<"uuid">;
}): Promise<ITodoAppTodoUser> {
  const { systemAdmin, userId, todoUserId } = props;

  // Authorization: verify active system admin membership
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

  // Retrieve the specific assignment scoped to owner and excluding soft-deleted
  const row = await MyGlobal.prisma.todo_app_todousers.findFirst({
    where: {
      id: todoUserId,
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
  if (!row) throw new HttpException("Not Found", 404);

  return {
    id: typia.assert<string & tags.Format<"uuid">>(row.id),
    todo_app_user_id: typia.assert<string & tags.Format<"uuid">>(
      row.todo_app_user_id,
    ),
    granted_at: toISOStringSafe(row.granted_at),
    revoked_at: row.revoked_at ? toISOStringSafe(row.revoked_at) : null,
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
  };
}
