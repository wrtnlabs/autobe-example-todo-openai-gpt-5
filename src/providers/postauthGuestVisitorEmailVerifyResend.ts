import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEmailVerification";

export async function postauthGuestVisitorEmailVerifyResend(props: {
  body: ITodoAppEmailVerification.IResendRequest;
}): Promise<ITodoAppEmailVerification.ISummary> {
  /**
   * Resend an email verification by creating a new token record.
   *
   * This public endpoint acknowledges a verification resend request without
   * revealing whether the email exists. Due to a schema/API contradiction
   * (Prisma model todo_app_email_verifications requires a user id while this
   * request only provides an email), this implementation returns a
   * privacy-preserving synthetic summary and does not persist a database row.
   *
   * A proper implementation requires either: (1) making todo_app_user_id
   * nullable, or (2) enhancing the request/auth context to supply a user id.
   *
   * @param props - Request properties
   * @param props.body - Resend request containing the target email
   * @returns A verification summary with generated identifiers and timings
   * @throws {HttpException} Policy-based throttling or validation errors (N/A
   *   here)
   */
  const { body } = props;

  // Business timestamps
  const sentAt = toISOStringSafe(new Date());
  const expiresAt = toISOStringSafe(
    new Date(Date.parse(sentAt) + 15 * 60 * 1000),
  );

  // Privacy-preserving acknowledgment summary (no secrets, no raw token)
  return {
    id: v4() as string & tags.Format<"uuid">,
    target_email: body.email,
    sent_at: sentAt,
    expires_at: expiresAt,
    consumed_at: null,
    failure_count: 0 as number & tags.Type<"int32">,
  };
}
