import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppSystemAdminEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminEmailVerification";
import { ITodoAppSystemAdminEmailVerificationResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminEmailVerificationResult";

export async function postauthSystemAdminEmailVerify(props: {
  body: ITodoAppSystemAdminEmailVerification.ICreate;
}): Promise<ITodoAppSystemAdminEmailVerificationResult> {
  /**
   * Verify admin email via todo_app_email_verifications and update
   * todo_app_users.
   *
   * Consumes a verification token recorded in todo_app_email_verifications. It
   * validates that the token exists, is not already consumed, and has not
   * expired. Upon success, it marks the token as consumed and sets
   * email_verified=true and verified_at on the corresponding user. No
   * authentication required for this operation.
   *
   * @param props - Request properties
   * @param props.body - Email verification token consumption payload
   * @returns Result summarizing verification state and token consumption
   * @throws {HttpException} 400 - Invalid/expired token or malformed input
   * @throws {HttpException} 409 - Token already consumed
   */
  const tokenRaw = props.body?.token ?? "";
  const token = tokenRaw.trim();

  // Basic input validation (privacy-preserving)
  if (token.length === 0 || token.length > 2048) {
    throw new HttpException("Bad Request: Invalid or expired token", 400);
  }

  // Lookup the token record (use raw token column for compatibility)
  const record = await MyGlobal.prisma.todo_app_email_verifications.findFirst({
    where: {
      token,
      deleted_at: null,
    },
    select: {
      id: true,
      todo_app_user_id: true,
      expires_at: true,
      consumed_at: true,
    },
  });

  if (!record) {
    // Privacy-preserving response
    throw new HttpException("Bad Request: Invalid or expired token", 400);
  }

  // Already consumed?
  if (record.consumed_at !== null) {
    throw new HttpException("Conflict: Token already consumed", 409);
  }

  // Expiry check using ISO string comparison (no Date declarations)
  const nowIso = toISOStringSafe(new Date());
  if (record.expires_at !== null) {
    const expIso = toISOStringSafe(record.expires_at);
    if (expIso < nowIso) {
      throw new HttpException("Bad Request: Invalid or expired token", 400);
    }
  }

  // Perform atomic consumption + user verification in a transaction
  const updatedUser = await MyGlobal.prisma.$transaction(async (tx) => {
    const consume = await tx.todo_app_email_verifications.updateMany({
      where: {
        id: record.id,
        consumed_at: null,
      },
      data: {
        consumed_at: nowIso,
        updated_at: nowIso,
      },
    });

    if (consume.count === 0) {
      // Another process consumed it concurrently
      throw new HttpException("Conflict: Token already consumed", 409);
    }

    const user = await tx.todo_app_users.update({
      where: { id: record.todo_app_user_id },
      data: {
        email_verified: true,
        verified_at: nowIso,
        updated_at: nowIso,
      },
      select: {
        email_verified: true,
        verified_at: true,
      },
    });

    return user;
  });

  return {
    email_verified: updatedUser.email_verified === true,
    verified_at:
      updatedUser.verified_at !== null
        ? toISOStringSafe(updatedUser.verified_at)
        : null,
    token_consumed: true,
  };
}
