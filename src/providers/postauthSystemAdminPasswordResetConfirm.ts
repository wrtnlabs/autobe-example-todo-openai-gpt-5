import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppSystemAdminPasswordResetConfirm } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminPasswordResetConfirm";
import { ITodoAppSystemAdminPasswordResetConfirmResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminPasswordResetConfirmResult";

export async function postauthSystemAdminPasswordResetConfirm(props: {
  body: ITodoAppSystemAdminPasswordResetConfirm.ICreate;
}): Promise<ITodoAppSystemAdminPasswordResetConfirmResult> {
  const { body } = props;

  // Basic payload validation beyond DTO (reject blank token)
  const token = (body.token ?? "").trim();
  if (token.length === 0) {
    throw new HttpException("Bad Request: Token must not be empty", 400);
  }

  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());

  await MyGlobal.prisma.$transaction(async (tx) => {
    // Find valid (unconsumed, unexpired, not deleted) reset record by plaintext token
    // Note: Schema contains token_hash as preferred lookup; plaintext token lookup used here due to available utilities.
    const reset = await tx.todo_app_password_resets.findFirst({
      where: {
        token,
        consumed_at: null,
        deleted_at: null,
        expires_at: { gt: now },
      },
      select: { id: true, todo_app_user_id: true },
    });

    if (!reset || !reset.todo_app_user_id) {
      // Privacy-preserving error: do not reveal whether account exists
      throw new HttpException("Invalid or expired token", 400);
    }

    // Ensure user exists
    const user = await tx.todo_app_users.findUnique({
      where: { id: reset.todo_app_user_id },
      select: { id: true },
    });
    if (!user) {
      throw new HttpException("Invalid or expired token", 400);
    }

    // Hash the new password and update user
    const hashed = await MyGlobal.password.hash(body.new_password);
    await tx.todo_app_users.update({
      where: { id: user.id },
      data: {
        password_hash: hashed,
        updated_at: now,
      },
    });

    // Mark reset token as consumed
    await tx.todo_app_password_resets.update({
      where: { id: reset.id },
      data: {
        consumed_at: now,
        updated_at: now,
      },
    });

    // Revoke active sessions for this user and their refresh tokens
    const sessions = await tx.todo_app_sessions.findMany({
      where: {
        todo_app_user_id: user.id,
        deleted_at: null,
        revoked_at: null,
        expires_at: { gt: now },
      },
      select: { id: true },
    });

    if (sessions.length > 0) {
      // Revoke sessions
      await tx.todo_app_sessions.updateMany({
        where: {
          todo_app_user_id: user.id,
          deleted_at: null,
          revoked_at: null,
          expires_at: { gt: now },
        },
        data: {
          revoked_at: now,
          revoked_reason: "password_reset",
          updated_at: now,
        },
      });

      // Revoke refresh tokens in chains for those sessions
      await tx.todo_app_refresh_tokens.updateMany({
        where: {
          todo_app_session_id: { in: sessions.map((s) => s.id) },
          deleted_at: null,
          revoked_at: null,
          expires_at: { gt: now },
        },
        data: {
          revoked_at: now,
          revoked_reason: "password_reset",
          updated_at: now,
        },
      });

      // Record explicit revocations for auditability (id must be provided)
      for (const s of sessions) {
        await tx.todo_app_session_revocations.upsert({
          where: { todo_app_session_id: s.id },
          update: {
            revoked_at: now,
            revoked_by: "system",
            reason: "password_reset",
            updated_at: now,
          },
          create: {
            id: v4(),
            todo_app_session_id: s.id,
            revoked_at: now,
            revoked_by: "system",
            reason: "password_reset",
            created_at: now,
            updated_at: now,
            deleted_at: null,
          },
        });
      }
    }
  });

  return {
    success: true,
    message:
      "Password reset confirmed. You can now sign in with your new password.",
  };
}
