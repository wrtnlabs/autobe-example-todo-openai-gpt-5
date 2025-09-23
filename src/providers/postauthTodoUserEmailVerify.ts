import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppTodoUserEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserEmailVerification";
import { ITodoAppEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEmailVerification";

/**
 * Verify email using todo_app_email_verifications and update todo_app_users
 * verification fields.
 *
 * Confirms email ownership by validating a verification token stored in
 * todo_app_email_verifications. Enforces expiry and single-use semantics, marks
 * the token as consumed, and updates the linked user's verification flags. May
 * transition user status from "pending_verification" to "active" per policy.
 *
 * Security: Does not disclose account existence beyond possession of a valid
 * token. On invalid or expired tokens, returns a generic error.
 *
 * @param props - Request properties
 * @param props.body - Verification payload carrying the opaque token
 * @returns The email verification record metadata after consumption
 * @throws {HttpException} 400 when token is invalid, expired, deleted, or
 *   already consumed
 */
export async function postauthTodoUserEmailVerify(props: {
  body: ITodoAppTodoUserEmailVerification.IConsume;
}): Promise<ITodoAppEmailVerification> {
  const { body } = props;

  const now = toISOStringSafe(new Date());

  // Lookup a valid, unconsumed, non-deleted verification within expiry window
  const verification =
    await MyGlobal.prisma.todo_app_email_verifications.findFirst({
      where: {
        token: body.token,
        consumed_at: null,
        deleted_at: null,
        expires_at: { gt: now },
      },
    });

  if (!verification) {
    // Best-effort: increment failure_count if any matching token exists
    await MyGlobal.prisma.todo_app_email_verifications.updateMany({
      where: { token: body.token },
      data: { failure_count: { increment: 1 }, updated_at: now },
    });
    throw new HttpException("Invalid or expired verification token", 400);
  }

  // Fetch linked user to determine status transition policy
  const user = await MyGlobal.prisma.todo_app_users.findUniqueOrThrow({
    where: { id: verification.todo_app_user_id },
  });

  const nextStatus =
    user.status === "pending_verification" ? "active" : undefined;

  const [updatedVerification] = await MyGlobal.prisma.$transaction([
    MyGlobal.prisma.todo_app_email_verifications.update({
      where: { id: verification.id },
      data: {
        consumed_at: now,
        updated_at: now,
      },
    }),
    MyGlobal.prisma.todo_app_users.update({
      where: { id: verification.todo_app_user_id },
      data: {
        email_verified: true,
        verified_at: now,
        updated_at: now,
        ...(nextStatus !== undefined ? { status: nextStatus } : {}),
      },
    }),
  ]);

  // Build response with proper date conversions and branding
  return {
    id: updatedVerification.id as string & tags.Format<"uuid">,
    todo_app_user_id: updatedVerification.todo_app_user_id as string &
      tags.Format<"uuid">,
    target_email: updatedVerification.target_email as string &
      tags.Format<"email">,
    sent_at: toISOStringSafe(updatedVerification.sent_at),
    expires_at: toISOStringSafe(updatedVerification.expires_at),
    consumed_at: now,
    failure_count: updatedVerification.failure_count as number &
      tags.Type<"int32">,
    consumed_by_ip: updatedVerification.consumed_by_ip ?? null,
    created_at: toISOStringSafe(updatedVerification.created_at),
    updated_at: now,
  };
}
