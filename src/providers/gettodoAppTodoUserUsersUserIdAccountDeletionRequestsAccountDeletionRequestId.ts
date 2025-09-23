import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppAccountDeletionRequest } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAccountDeletionRequest";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

/**
 * Get a user’s account deletion request by ID from
 * todo_app_account_deletion_requests
 *
 * Retrieves a specific account deletion request that belongs to the given user.
 * Ownership is enforced: only the resource owner (todoUser) can access it.
 * Soft-deleted records (deleted_at not null) are excluded from normal
 * responses.
 *
 * @param props - Request properties
 * @param props.todoUser - Authenticated todo user payload (must match userId)
 * @param props.userId - UUID of the owner user
 * @param props.accountDeletionRequestId - UUID of the account deletion request
 * @returns Full detail of the account deletion request
 * @throws {HttpException} 403 when the authenticated user does not match userId
 * @throws {HttpException} 404 when the record does not exist for the user
 */
export async function gettodoAppTodoUserUsersUserIdAccountDeletionRequestsAccountDeletionRequestId(props: {
  todoUser: TodouserPayload;
  userId: string & tags.Format<"uuid">;
  accountDeletionRequestId: string & tags.Format<"uuid">;
}): Promise<ITodoAppAccountDeletionRequest> {
  const { todoUser, userId, accountDeletionRequestId } = props;

  // Authorization: ensure the authenticated user is the owner in path
  if (todoUser.id !== userId) {
    throw new HttpException(
      "Forbidden: You can only access your own account deletion requests",
      403,
    );
  }

  // Retrieve the record ensuring ownership and excluding soft-deleted rows
  const row =
    await MyGlobal.prisma.todo_app_account_deletion_requests.findFirst({
      where: {
        id: accountDeletionRequestId,
        todo_app_user_id: userId,
        deleted_at: null,
      },
      select: {
        id: true,
        todo_app_user_id: true,
        status: true,
        reason: true,
        confirmed_at: true,
        scheduled_purge_at: true,
        processed_at: true,
        canceled_at: true,
        request_ip: true,
        request_user_agent: true,
        created_at: true,
        updated_at: true,
        deleted_at: true,
      },
    });

  if (!row) {
    throw new HttpException("Not Found", 404);
  }

  // Map to DTO with proper date conversions and optional handling
  const result: ITodoAppAccountDeletionRequest = {
    id: row.id,
    todo_app_user_id: row.todo_app_user_id,
    status: row.status,
    reason: row.reason === null ? undefined : row.reason,
    confirmed_at: row.confirmed_at
      ? toISOStringSafe(row.confirmed_at)
      : undefined,
    scheduled_purge_at: row.scheduled_purge_at
      ? toISOStringSafe(row.scheduled_purge_at)
      : undefined,
    processed_at: row.processed_at
      ? toISOStringSafe(row.processed_at)
      : undefined,
    canceled_at: row.canceled_at ? toISOStringSafe(row.canceled_at) : undefined,
    request_ip: row.request_ip === null ? undefined : row.request_ip,
    request_user_agent:
      row.request_user_agent === null ? undefined : row.request_user_agent,
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
    deleted_at: row.deleted_at ? toISOStringSafe(row.deleted_at) : undefined,
  };

  return result;
}
