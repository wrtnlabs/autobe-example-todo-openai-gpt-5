import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppPasswordReset } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPasswordReset";

/**
 * Consume todo_app_password_resets and apply new todo_app_users.password_hash.
 *
 * Confirms a password reset by validating an opaque token against
 * todo_app_password_resets (must be unconsumed, unexpired, and not deleted),
 * updating the owner's password_hash, and marking the reset as consumed.
 *
 * Unauthenticated endpoint; responses avoid leaking sensitive details beyond
 * success/failure. This implementation does not auto-sign-in; it only updates
 * credentials and completion state.
 *
 * @param props - Request properties
 * @param props.body - Token and new credential payload
 * @returns Summary of the reset request without secrets (ISummary)
 * @throws {HttpException} 400 when token is invalid/expired/consumed or user
 *   not resolvable
 */
export async function postauthGuestVisitorPasswordResetConfirm(props: {
  body: ITodoAppPasswordReset.IConfirm;
}): Promise<ITodoAppPasswordReset.ISummary> {
  const { token, new_password } = props.body;

  // Current timestamp for consistency across writes
  const now = toISOStringSafe(new Date());

  // 1) Locate an active, unconsumed, unexpired reset request by opaque token
  const reset = await MyGlobal.prisma.todo_app_password_resets.findFirst({
    where: {
      token, // Plain token match (schema retains token alongside token_hash)
      deleted_at: null,
      consumed_at: null,
      expires_at: { gt: now },
    },
  });
  if (!reset) {
    // Generic message to avoid token/account existence leakage
    throw new HttpException("Invalid or expired token", 400);
  }

  // 2) Resolve owning user either by FK or by unique email
  let userId: string | null = null;
  if (reset.todo_app_user_id !== null && reset.todo_app_user_id !== undefined) {
    userId = reset.todo_app_user_id;
    const user = await MyGlobal.prisma.todo_app_users.findUnique({
      where: { id: userId },
    });
    if (!user) throw new HttpException("Invalid or expired token", 400);
  } else {
    const user = await MyGlobal.prisma.todo_app_users.findUnique({
      where: { email: reset.email },
    });
    if (!user) throw new HttpException("Invalid or expired token", 400);
    userId = user.id;
  }

  // 3) Securely hash the new password
  const password_hash = await MyGlobal.password.hash(new_password);

  // 4) Apply changes atomically
  await MyGlobal.prisma.$transaction(async (tx) => {
    // Update user's credential and updated_at
    await tx.todo_app_users.update({
      where: { id: userId as string },
      data: {
        password_hash,
        updated_at: now,
      },
    });

    // Mark the reset token as consumed
    await tx.todo_app_password_resets.update({
      where: { id: reset.id },
      data: {
        consumed_at: now,
        updated_at: now,
      },
    });
  });

  // 5) Build response summary (no secrets). Reuse prepared timestamps.
  return {
    id: reset.id as string & tags.Format<"uuid">,
    email: reset.email as string & tags.Format<"email">,
    requested_at: toISOStringSafe(reset.requested_at),
    expires_at: toISOStringSafe(reset.expires_at),
    consumed_at: now,
  };
}
