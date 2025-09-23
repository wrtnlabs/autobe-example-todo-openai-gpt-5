import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEmailVerification";

/**
 * Consume todo_app_email_verifications to set todo_app_users.email_verified and
 * verified_at.
 *
 * Validates the opaque verification token by locating an unconsumed, unexpired
 * verification record. When valid, marks the token as consumed and updates the
 * corresponding user's email flags. All failures (unknown/expired/consumed) use
 * a uniform error to avoid information leakage. For invalid attempts where a
 * matching record exists but is not valid, failure_count is incremented.
 *
 * No authentication is required.
 *
 * @param props - Request properties
 * @param props.body - Confirmation payload containing the opaque token
 * @returns Verification summary including lifecycle timestamps and counters
 * @throws {HttpException} 400 Invalid or expired verification token
 */
export async function postauthGuestVisitorEmailVerify(props: {
  body: ITodoAppEmailVerification.IConfirm;
}): Promise<ITodoAppEmailVerification.ISummary> {
  const { body } = props;

  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());

  // Find a valid (unconsumed, unexpired, not deleted) verification by plaintext token
  const valid = await MyGlobal.prisma.todo_app_email_verifications.findFirst({
    where: {
      token: body.token,
      deleted_at: null,
      consumed_at: null,
      expires_at: { gt: now },
    },
  });

  if (!valid) {
    // Try to locate the token ignoring expiry/consumption to increment failure_count (optional hardening)
    const candidate =
      await MyGlobal.prisma.todo_app_email_verifications.findFirst({
        where: {
          token: body.token,
          deleted_at: null,
        },
      });

    if (candidate) {
      await MyGlobal.prisma.todo_app_email_verifications.update({
        where: { id: candidate.id },
        data: {
          failure_count: candidate.failure_count + 1,
          updated_at: now,
        },
      });
    }

    throw new HttpException("Invalid or expired verification token", 400);
  }

  // Perform atomic updates: consume token and update user flags
  const [updatedVerification] = await MyGlobal.prisma.$transaction([
    MyGlobal.prisma.todo_app_email_verifications.update({
      where: { id: valid.id },
      data: {
        consumed_at: now,
        updated_at: now,
      },
    }),
    MyGlobal.prisma.todo_app_users.update({
      where: { id: valid.todo_app_user_id },
      data: {
        email_verified: true,
        verified_at: now,
        email: valid.target_email,
        updated_at: now,
      },
    }),
  ]);

  // Build response summary with proper ISO conversions
  return {
    id: updatedVerification.id as string & tags.Format<"uuid">,
    target_email: updatedVerification.target_email as string &
      tags.Format<"email">,
    sent_at: toISOStringSafe(updatedVerification.sent_at),
    expires_at: toISOStringSafe(updatedVerification.expires_at),
    consumed_at: updatedVerification.consumed_at
      ? toISOStringSafe(updatedVerification.consumed_at)
      : null,
    failure_count: updatedVerification.failure_count,
  };
}
