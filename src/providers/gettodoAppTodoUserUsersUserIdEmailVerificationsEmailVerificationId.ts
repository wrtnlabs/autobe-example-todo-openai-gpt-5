import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEmailVerification";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

/**
 * Get a specific email verification (todo_app_email_verifications) for a user
 *
 * Retrieves a single email verification record owned by the authenticated user.
 * Exposes only safe metadata (no token/token_hash). Respects soft delete by
 * excluding records with deleted_at set.
 *
 * Authorization: Only the owner (todoUser) may access their own record. The
 * path userId must equal the authenticated principal id.
 *
 * @param props - Request properties
 * @param props.todoUser - Authenticated todo user payload (owner)
 * @param props.userId - Owner user’s ID (UUID) of the email verification record
 * @param props.emailVerificationId - Email verification record ID (UUID) to
 *   retrieve
 * @returns Email verification metadata conforming to ITodoAppEmailVerification
 * @throws {HttpException} 403 when path userId differs from authenticated user
 * @throws {HttpException} 404 when the record does not exist for the owner or
 *   is soft-deleted
 */
export async function gettodoAppTodoUserUsersUserIdEmailVerificationsEmailVerificationId(props: {
  todoUser: TodouserPayload;
  userId: string & tags.Format<"uuid">;
  emailVerificationId: string & tags.Format<"uuid">;
}): Promise<ITodoAppEmailVerification> {
  const { todoUser, userId, emailVerificationId } = props;

  // Authorization: path userId must match authenticated principal
  if (todoUser.id !== userId) {
    throw new HttpException(
      "Forbidden: You can only access your own email verifications",
      403,
    );
  }

  // Fetch the record owned by the user and not soft-deleted
  const record = await MyGlobal.prisma.todo_app_email_verifications.findFirst({
    where: {
      id: emailVerificationId,
      todo_app_user_id: userId,
      deleted_at: null,
    },
    select: {
      id: true,
      todo_app_user_id: true,
      target_email: true,
      sent_at: true,
      expires_at: true,
      consumed_at: true,
      failure_count: true,
      consumed_by_ip: true,
      created_at: true,
      updated_at: true,
    },
  });

  if (!record) {
    throw new HttpException("Not Found", 404);
  }

  // Map to DTO with proper branding and date conversions
  return {
    id: record.id as string & tags.Format<"uuid">,
    todo_app_user_id: record.todo_app_user_id as string & tags.Format<"uuid">,
    target_email: record.target_email as string & tags.Format<"email">,
    sent_at: toISOStringSafe(record.sent_at),
    expires_at: toISOStringSafe(record.expires_at),
    consumed_at: record.consumed_at
      ? toISOStringSafe(record.consumed_at)
      : null,
    failure_count: Number(record.failure_count) as number & tags.Type<"int32">,
    consumed_by_ip: record.consumed_by_ip ?? null,
    created_at: toISOStringSafe(record.created_at),
    updated_at: toISOStringSafe(record.updated_at),
  };
}
