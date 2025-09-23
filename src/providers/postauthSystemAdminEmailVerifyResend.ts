import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppSystemAdminEmailVerificationResend } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminEmailVerificationResend";
import { ITodoAppSystemAdminEmailVerificationResendResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminEmailVerificationResendResult";

/**
 * Resend admin verification email using todo_app_email_verifications.
 *
 * Public endpoint that enqueues a new verification token for the provided email
 * in a privacy-preserving way. If a matching unverified user exists, a new row
 * is inserted into todo_app_email_verifications with token, token_hash,
 * target_email, sent_at, and expires_at. Regardless of existence or current
 * verification state, this endpoint responds with a generic acknowledgment
 * without disclosing sensitive information or user existence.
 *
 * Policy notes:
 *
 * - Does not alter todo_app_users fields.
 * - Previous tokens remain for audit/rate limiting as independent rows.
 * - May be subject to external rate limits (not enforced here).
 *
 * @param props - Request properties
 * @param props.body - Resend request containing the target email
 * @returns Generic acknowledgment; may include sent_at/expires_at when a token
 *   was created
 * @throws {HttpException} 500 on unexpected database errors
 */
export async function postauthSystemAdminEmailVerifyResend(props: {
  body: ITodoAppSystemAdminEmailVerificationResend.ICreate;
}): Promise<ITodoAppSystemAdminEmailVerificationResendResult> {
  const { body } = props;

  // Privacy-preserving behavior: prepare default acknowledgment
  let sentAt: (string & tags.Format<"date-time">) | undefined = undefined;
  let expiresAt: (string & tags.Format<"date-time">) | undefined = undefined;

  try {
    // Look up user by email, excluding soft-deleted accounts
    const user = await MyGlobal.prisma.todo_app_users.findFirst({
      where: {
        email: body.email,
        deleted_at: null,
      },
      select: {
        id: true,
        email_verified: true,
      },
    });

    // Only create a verification entry when user exists and is not verified
    if (user && !user.email_verified) {
      // Timestamps per policy: sent now, expires in 24 hours
      sentAt = toISOStringSafe(new Date());
      expiresAt = toISOStringSafe(new Date(Date.now() + 24 * 60 * 60 * 1000));

      // Generate opaque token and a separate token_hash (privacy: do not return them)
      const token = v4();
      const tokenHash = v4();

      await MyGlobal.prisma.todo_app_email_verifications.create({
        data: {
          id: v4(),
          todo_app_user_id: user.id,
          token: token,
          token_hash: tokenHash,
          target_email: body.email,
          sent_at: sentAt,
          expires_at: expiresAt,
          consumed_at: null,
          failure_count: 0,
          consumed_by_ip: null,
          created_at: sentAt,
          updated_at: sentAt,
          deleted_at: null,
        },
      });
    }
  } catch (err) {
    // Do not leak existence; convert unexpected issues to a generic server error
    // while maintaining privacy. Business may prefer still acknowledging, but
    // explicit error helps monitoring in provider layer.
    throw new HttpException("Internal Server Error", 500);
  }

  // Always acknowledge without revealing account existence or token values
  return {
    acknowledged: true,
    sent_at: sentAt ?? undefined,
    expires_at: expiresAt ?? undefined,
  };
}
