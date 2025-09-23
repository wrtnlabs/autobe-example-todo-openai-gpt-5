import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppTodoUserPassword } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserPassword";
import { ITodoAppPasswordChange } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPasswordChange";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

export async function putauthTodoUserPasswordChange(props: {
  todoUser: TodouserPayload;
  body: ITodoAppTodoUserPassword.IChange;
}): Promise<ITodoAppPasswordChange> {
  const { todoUser, body } = props;

  /**
   * Change password for authenticated todoUser by verifying current credentials
   * and updating todo_app_users.password_hash, with optional revocation of
   * other sessions.
   *
   * Security:
   *
   * - Verifies current password using server-side hash
   * - On request, revokes other active sessions and their refresh tokens
   * - Records revocation entries per session
   *
   * Authorization:
   *
   * - Requires authenticated todouser payload
   * - Ensures the account is active, email-verified, and not soft-deleted
   *
   * @param props - Request properties
   * @param props.todoUser - Authenticated todouser payload (owner user id)
   * @param props.body - Password change request containing current and new
   *   password
   * @returns Operation result with success flag, effective change time, and
   *   optional metadata
   * @throws {HttpException} 403 When current password is invalid or account not
   *   eligible
   * @throws {HttpException} 404 When user record does not exist
   */

  // Basic password policy double-check (payload already validated at boundary)
  if (
    !body.newPassword ||
    body.newPassword.length < 8 ||
    body.newPassword.length > 64
  ) {
    throw new HttpException(
      "Bad Request: New password does not meet policy",
      400,
    );
  }

  // Load user and validate eligibility
  const user = await MyGlobal.prisma.todo_app_users.findUnique({
    where: { id: todoUser.id },
  });
  if (!user) throw new HttpException("Not Found", 404);
  if (user.deleted_at !== null) throw new HttpException("Forbidden", 403);
  if (user.status !== "active" || user.email_verified !== true) {
    throw new HttpException("Forbidden", 403);
  }

  // Verify current password
  const ok = await MyGlobal.password.verify(
    body.currentPassword,
    user.password_hash,
  );
  if (!ok) {
    throw new HttpException("Forbidden: Invalid credentials", 403);
  }

  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());
  const newHash = await MyGlobal.password.hash(body.newPassword);

  await MyGlobal.prisma.$transaction(async (tx) => {
    // Update password hash and timestamp
    await tx.todo_app_users.update({
      where: { id: todoUser.id },
      data: {
        password_hash: newHash,
        updated_at: now,
      },
    });

    // Optional: revoke other sessions and their refresh chains
    if (body.revokeOtherSessions === true) {
      const sessions = await tx.todo_app_sessions.findMany({
        where: {
          todo_app_user_id: todoUser.id,
          revoked_at: null,
          deleted_at: null,
        },
        select: { id: true },
      });

      if (sessions.length > 0) {
        // Revoke sessions and their refresh tokens; write revocation rows
        await Promise.all(
          sessions.map(async (s) => {
            await tx.todo_app_sessions.update({
              where: { id: s.id },
              data: {
                revoked_at: now,
                revoked_reason: "Password changed",
                updated_at: now,
              },
            });

            // Upsert single revocation record per session (unique on todo_app_session_id)
            await tx.todo_app_session_revocations.upsert({
              where: { todo_app_session_id: s.id },
              update: {
                revoked_at: now,
                revoked_by: "user",
                reason: "password_change",
                updated_at: now,
              },
              create: {
                id: v4() as string & tags.Format<"uuid">,
                todo_app_session_id: s.id,
                revoked_at: now,
                revoked_by: "user",
                reason: "password_change",
                created_at: now,
                updated_at: now,
              },
            });

            await tx.todo_app_refresh_tokens.updateMany({
              where: {
                todo_app_session_id: s.id,
                revoked_at: null,
              },
              data: {
                revoked_at: now,
                revoked_reason: "Session revoked due to password change",
                updated_at: now,
              },
            });
          }),
        );
      }

      // Optional audit trail (non-sensitive)
      await tx.todo_app_audit_logs.create({
        data: {
          id: v4() as string & tags.Format<"uuid">,
          actor_user_id: todoUser.id,
          target_user_id: todoUser.id,
          action: "change_password",
          resource_type: "todo_app_users",
          resource_id: todoUser.id,
          success: true,
          created_at: now,
          updated_at: now,
        },
      });
    }
  });

  return {
    success: true,
    changedAt: now,
    revokedOtherSessions: body.revokeOtherSessions === true ? true : undefined,
    message:
      body.revokeOtherSessions === true
        ? "Password changed and other sessions revoked"
        : "Password changed",
  };
}
