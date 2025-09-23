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
 * Get a specific account deletion request (todo_app_account_deletion_requests)
 * by ID for the authenticated user
 *
 * Retrieves details of a single account deletion request owned by the
 * authenticated todoUser. Ensures ownership (todo_app_user_id === authenticated
 * user.id) and excludes logically deleted records. Returns status, reason,
 * lifecycle timestamps, client context, and audit metadata.
 *
 * @param props - Request properties
 * @param props.todoUser - The authenticated todoUser payload
 * @param props.accountDeletionRequestId - UUID of the account deletion request
 *   to retrieve
 * @returns Detailed information about the requested account deletion workflow
 *   record
 * @throws {HttpException} 404 when the record does not exist, is soft-deleted,
 *   or not owned by the caller
 */
export async function gettodoAppTodoUserAccountDeletionRequestsAccountDeletionRequestId(props: {
  todoUser: TodouserPayload;
  accountDeletionRequestId: string & tags.Format<"uuid">;
}): Promise<ITodoAppAccountDeletionRequest> {
  const { todoUser, accountDeletionRequestId } = props;

  const row =
    await MyGlobal.prisma.todo_app_account_deletion_requests.findFirst({
      where: {
        id: accountDeletionRequestId,
        todo_app_user_id: todoUser.id,
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

  const output = {
    id: row.id,
    todo_app_user_id: row.todo_app_user_id,
    status: row.status,
    reason: row.reason ?? null,
    confirmed_at: row.confirmed_at ? toISOStringSafe(row.confirmed_at) : null,
    scheduled_purge_at: row.scheduled_purge_at
      ? toISOStringSafe(row.scheduled_purge_at)
      : null,
    processed_at: row.processed_at ? toISOStringSafe(row.processed_at) : null,
    canceled_at: row.canceled_at ? toISOStringSafe(row.canceled_at) : null,
    request_ip: row.request_ip ?? null,
    request_user_agent: row.request_user_agent ?? null,
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
    deleted_at: row.deleted_at ? toISOStringSafe(row.deleted_at) : null,
  };

  return typia.assert<ITodoAppAccountDeletionRequest>(output);
}
