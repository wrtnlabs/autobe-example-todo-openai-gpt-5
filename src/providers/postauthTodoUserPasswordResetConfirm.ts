import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppTodoUserPasswordReset } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserPasswordReset";
import { ITodoAppPasswordReset } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPasswordReset";

/**
 * Confirm password reset using todo_app_password_resets; update password and
 * revoke sessions.
 *
 * Validates the provided opaque token against todo_app_password_resets by
 * token/token_hash, ensures it is unexpired and unconsumed, then:
 *
 * - Updates the associated todo_app_users.password_hash
 * - Stamps consumed_at on the reset record
 * - Revokes all active sessions for the user and marks related refresh tokens
 *   revoked
 * - Optionally records session revocations
 *
 * Public endpoint: identity proven by possession of a valid token. No account
 * existence leakage.
 *
 * @param props - Request properties
 * @param props.body - Reset confirmation payload containing token and new
 *   password
 * @returns Completion metadata for the processed password reset
 * @throws {HttpException} 400 When token is invalid, expired, consumed, or
 *   password policy fails
 */
export async function postauthTodoUserPasswordResetConfirm(props: {
  body: ITodoAppTodoUserPasswordReset.IConfirm;
}): Promise<ITodoAppPasswordReset.ICompleted> {
  const { body } = props;

  // Basic password policy enforcement (runtime guard in addition to DTO constraints)
  const pwd = body.new_password;
  if (typeof pwd !== "string" || pwd.length < 8 || pwd.length > 64) {
    throw new HttpException("Bad Request: Invalid new password", 400);
  }

  const nowIso = toISOStringSafe(new Date());

  // Atomic workflow
  const result = await MyGlobal.prisma.$transaction(async (tx) => {
    // 1) Find a valid reset record
    const reset = await tx.todo_app_password_resets.findFirst({
      where: {
        deleted_at: null,
        consumed_at: null,
        expires_at: { gt: nowIso },
        OR: [{ token: body.token }, { token_hash: body.token }],
      },
    });

    if (!reset) {
      throw new HttpException("Invalid or expired token", 400);
    }

    // 2) Resolve target user
    let userId: string | null = reset.todo_app_user_id ?? null;
    if (!userId) {
      const userByEmail = await tx.todo_app_users.findFirst({
        where: { email: reset.email, deleted_at: null },
        select: { id: true },
      });
      if (!userByEmail) {
        throw new HttpException("Invalid or expired token", 400);
      }
      userId = userByEmail.id;
    }

    // 3) Hash new password
    const hashed = await MyGlobal.password.hash(pwd);

    // 4) Update user password
    await tx.todo_app_users.update({
      where: { id: userId },
      data: {
        password_hash: hashed,
        updated_at: nowIso,
      },
    });

    // 5) Mark reset consumed
    await tx.todo_app_password_resets.update({
      where: { id: reset.id },
      data: {
        consumed_at: nowIso,
        updated_at: nowIso,
      },
    });

    // 6) Revoke active sessions and related refresh tokens
    const sessions = await tx.todo_app_sessions.findMany({
      where: {
        todo_app_user_id: userId,
        revoked_at: null,
        deleted_at: null,
      },
      select: { id: true },
    });

    if (sessions.length > 0) {
      const sessionIds = sessions.map((s) => s.id);

      await tx.todo_app_sessions.updateMany({
        where: { id: { in: sessionIds } },
        data: {
          revoked_at: nowIso,
          revoked_reason: "password_reset",
          updated_at: nowIso,
        },
      });

      // Insert revocation records (skip duplicates for idempotency)
      await tx.todo_app_session_revocations.createMany({
        data: sessionIds.map((sid) => ({
          id: v4(),
          todo_app_session_id: sid,
          revoked_at: nowIso,
          revoked_by: "system",
          reason: "password_reset",
          created_at: nowIso,
          updated_at: nowIso,
        })),
        skipDuplicates: true,
      });

      await tx.todo_app_refresh_tokens.updateMany({
        where: { todo_app_session_id: { in: sessionIds }, revoked_at: null },
        data: {
          revoked_at: nowIso,
          revoked_reason: "password_reset",
          updated_at: nowIso,
        },
      });
    }

    // 7) Build response
    const response = {
      id: reset.id,
      email: reset.email,
      requestedAt: toISOStringSafe(reset.requested_at),
      expiresAt: toISOStringSafe(reset.expires_at),
      consumedAt: nowIso,
    };

    return typia.assert<ITodoAppPasswordReset.ICompleted>(response);
  });

  return result;
}
