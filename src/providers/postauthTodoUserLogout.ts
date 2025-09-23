import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

export async function postauthTodoUserLogout(props: {
  todoUser: TodouserPayload;
}): Promise<void> {
  /**
   * Logout current session by revoking session and recording revocation.
   *
   * Marks the most recent active session (for the authenticated todo user) as
   * revoked, ensures a single revocation record exists, optionally revokes the
   * latest active refresh token for that session, and appends an audit log with
   * action="logout".
   *
   * Idempotent behavior: if no active session is found (already revoked or
   * none), the operation succeeds without error and still records an audit log
   * entry.
   *
   * Security: Only affects the caller's own sessions (scoped by authenticated
   * user id).
   *
   * @param props - Request properties
   * @param props.todoUser - Authenticated Todo User payload
   * @returns Void
   * @throws {HttpException} 500 - On unexpected persistence errors
   */
  const userId = props.todoUser.id;
  const now = toISOStringSafe(new Date());

  try {
    await MyGlobal.prisma.$transaction(async (tx) => {
      // Find the most recent active (not revoked, not deleted, not expired) session for this user
      const session = await tx.todo_app_sessions.findFirst({
        where: {
          todo_app_user_id: userId,
          deleted_at: null,
          revoked_at: null,
          expires_at: { gt: now },
        },
        orderBy: { created_at: "desc" },
      });

      if (!session) {
        // No active session found - record audit log and exit (idempotent)
        await tx.todo_app_audit_logs.create({
          data: {
            id: v4(),
            actor_user_id: userId,
            target_user_id: null,
            action: "logout",
            resource_type: "todo_app_sessions",
            resource_id: null,
            success: true,
            ip: null,
            user_agent: null,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          },
        });
        return;
      }

      // Revoke the session
      await tx.todo_app_sessions.update({
        where: { id: session.id },
        data: {
          revoked_at: now,
          revoked_reason: "logout",
          updated_at: now,
        },
      });

      // Ensure a single revocation record exists via upsert
      await tx.todo_app_session_revocations.upsert({
        where: { todo_app_session_id: session.id },
        create: {
          id: v4(),
          todo_app_session_id: session.id,
          revoked_at: now,
          revoked_by: "user",
          reason: "logout",
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
        update: {
          revoked_at: now,
          revoked_by: "user",
          reason: "logout",
          updated_at: now,
        },
      });

      // Optionally revoke the latest active refresh token for this session
      const refresh = await tx.todo_app_refresh_tokens.findFirst({
        where: {
          todo_app_session_id: session.id,
          deleted_at: null,
          revoked_at: null,
          expires_at: { gt: now },
        },
        orderBy: { issued_at: "desc" },
      });

      if (refresh) {
        await tx.todo_app_refresh_tokens.update({
          where: { id: refresh.id },
          data: {
            revoked_at: now,
            revoked_reason: "logout",
            updated_at: now,
          },
        });
      }

      // Append audit log
      await tx.todo_app_audit_logs.create({
        data: {
          id: v4(),
          actor_user_id: userId,
          target_user_id: null,
          action: "logout",
          resource_type: "todo_app_sessions",
          resource_id: session.id,
          success: true,
          ip: null,
          user_agent: null,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      });
    });
  } catch (_err) {
    throw new HttpException("Internal Server Error", 500);
  }
}
