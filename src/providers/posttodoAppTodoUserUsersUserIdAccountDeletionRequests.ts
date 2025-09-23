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
 * Create a user’s account deletion request (todo_app_account_deletion_requests)
 *
 * Creates a new account deletion request for the authenticated todo user
 * identified by the path userId. Associates ownership via todo_app_user_id,
 * initializes workflow status per policy (pending_confirmation), and stamps
 * auditing timestamps. Request context (IP, user-agent) may be recorded by
 * other layers.
 *
 * Authorization:
 *
 * - Only the authenticated owner (todoUser) may create a request for their own
 *   userId.
 * - If the authenticated subject differs from userId, the request is forbidden.
 *
 * Business rules:
 *
 * - Reject when an active request already exists in pending/scheduled state
 *   (conflict).
 * - Initialize status to "pending_confirmation".
 *
 * @param props - Request properties
 * @param props.todoUser - Authenticated todo user payload (owner context)
 * @param props.userId - Owner user’s UUID (path parameter)
 * @param props.body - Creation payload carrying optional reason
 * @returns The created account deletion request record
 * @throws {HttpException} 403 when cross-user attempt
 * @throws {HttpException} 409 when a pending/scheduled request already exists
 */
export async function posttodoAppTodoUserUsersUserIdAccountDeletionRequests(props: {
  todoUser: TodouserPayload;
  userId: string & tags.Format<"uuid">;
  body: ITodoAppAccountDeletionRequest.ICreate;
}): Promise<ITodoAppAccountDeletionRequest> {
  const { todoUser, userId, body } = props;

  // Authorization: ensure the authenticated owner matches the path userId
  if (todoUser.id !== userId) {
    throw new HttpException("Forbidden", 403);
  }

  // Conflict policy: prevent overlapping pending/scheduled requests
  const existing =
    await MyGlobal.prisma.todo_app_account_deletion_requests.findFirst({
      where: {
        todo_app_user_id: userId,
        deleted_at: null,
        canceled_at: null,
        processed_at: null,
        OR: [{ status: "pending_confirmation" }, { status: "scheduled" }],
      },
      select: { id: true },
    });
  if (existing) {
    throw new HttpException(
      "Conflict: An account deletion request is already pending or scheduled",
      409,
    );
  }

  // Prepare timestamps
  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());

  // Create the deletion request
  const created =
    await MyGlobal.prisma.todo_app_account_deletion_requests.create({
      data: {
        id: v4(),
        todo_app_user_id: userId,
        status: "pending_confirmation",
        reason: body.reason ?? null,
        confirmed_at: null,
        scheduled_purge_at: null,
        processed_at: null,
        canceled_at: null,
        request_ip: null,
        request_user_agent: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    });

  // Map DB record (Date fields) to API DTO (ISO strings)
  return {
    id: typia.assert<string & tags.Format<"uuid">>(created.id),
    todo_app_user_id: typia.assert<string & tags.Format<"uuid">>(
      created.todo_app_user_id,
    ),
    status: created.status,
    reason: created.reason ?? null,
    confirmed_at: created.confirmed_at
      ? toISOStringSafe(created.confirmed_at)
      : null,
    scheduled_purge_at: created.scheduled_purge_at
      ? toISOStringSafe(created.scheduled_purge_at)
      : null,
    processed_at: created.processed_at
      ? toISOStringSafe(created.processed_at)
      : null,
    canceled_at: created.canceled_at
      ? toISOStringSafe(created.canceled_at)
      : null,
    request_ip: created.request_ip ?? null,
    request_user_agent: created.request_user_agent ?? null,
    created_at: toISOStringSafe(created.created_at),
    updated_at: toISOStringSafe(created.updated_at),
    deleted_at: created.deleted_at ? toISOStringSafe(created.deleted_at) : null,
  };
}
