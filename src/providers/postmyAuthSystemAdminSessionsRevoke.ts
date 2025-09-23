import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppSystemAdminSessionRevocation } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminSessionRevocation";
import { ITodoAppSystemAdminSessionRevocationResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminSessionRevocationResult";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

export async function postmyAuthSystemAdminSessionsRevoke(props: {
  systemAdmin: SystemadminPayload;
  body: ITodoAppSystemAdminSessionRevocation.ICreate;
}): Promise<ITodoAppSystemAdminSessionRevocationResult> {
  /**
   * Revoke other sessions using todo_app_sessions and
   * todo_app_session_revocations.
   *
   * Marks other active sessions (by default) for the authenticated system admin
   * as revoked by setting revoked_at and revoked_reason in
   * Auth.todo_app_sessions, creates a corresponding record in
   * Auth.todo_app_session_revocations (one per session), and revokes associated
   * Auth.todo_app_refresh_tokens. When body.revoke_current is true, includes
   * the current session as well; otherwise, excludes a single session
   * heuristically chosen as the oldest active session (by issued_at).
   *
   * Authorization: caller must be an active, verified system admin with a
   * non-revoked role assignment.
   *
   * @param props - Request context
   * @param props.systemAdmin - The authenticated system administrator payload
   *   (top-level user id)
   * @param props.body - Revocation options (revoke_current flag and optional
   *   reason)
   * @returns Summary of revoked sessions and affected refresh tokens
   * @throws {HttpException} 403 when caller is not authorized as an active
   *   system admin
   */
  const { systemAdmin, body } = props;

  // Authorization enforcement: validate active system admin membership and user state
  const membership = await MyGlobal.prisma.todo_app_systemadmins.findFirst({
    where: {
      todo_app_user_id: systemAdmin.id,
      revoked_at: null,
      deleted_at: null,
      user: {
        deleted_at: null,
        status: "active",
        email_verified: true,
      },
    },
  });
  if (!membership) {
    throw new HttpException(
      "Forbidden: inactive or missing system admin membership",
      403,
    );
  }

  const now = toISOStringSafe(new Date());

  // Fetch active, non-revoked, non-deleted, non-expired sessions of this admin, ordered by issued_at ASC
  const sessions = await MyGlobal.prisma.todo_app_sessions.findMany({
    where: {
      todo_app_user_id: systemAdmin.id,
      deleted_at: null,
      revoked_at: null,
      expires_at: { gt: now },
    },
    orderBy: { issued_at: "asc" },
    select: { id: true },
  });

  // Determine which sessions to revoke
  let targetSessionIds: string[] = sessions.map((s) => s.id);
  if (!body.revoke_current) {
    // Exclude a single session as the presumed current (oldest active by issued_at ordering above)
    if (targetSessionIds.length > 0)
      targetSessionIds = targetSessionIds.slice(1);
  }

  if (targetSessionIds.length === 0) {
    // No-op but successful
    // Optional audit log of no-op action
    await MyGlobal.prisma.todo_app_audit_logs.create({
      data: {
        id: v4(),
        actor_user_id: systemAdmin.id,
        target_user_id: null,
        action: "system_admin_sessions_revoke",
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

    return {
      success: true,
      revoked_sessions_count: 0,
      revoked_session_ids: [],
      revoked_refresh_tokens_count: 0,
      message: "No other active sessions to revoke.",
    };
  }

  // Execute revocation in a single transaction
  const reason = body.reason ?? undefined;
  const [updatedSessions, updatedRefreshTokens] =
    await MyGlobal.prisma.$transaction([
      // Revoke sessions in bulk
      MyGlobal.prisma.todo_app_sessions.updateMany({
        where: {
          id: { in: targetSessionIds },
          revoked_at: null,
          deleted_at: null,
          expires_at: { gt: now },
        },
        data: {
          revoked_at: now,
          revoked_reason: reason,
          updated_at: now,
        },
      }),
      // Revoke associated refresh tokens in bulk
      MyGlobal.prisma.todo_app_refresh_tokens.updateMany({
        where: {
          todo_app_session_id: { in: targetSessionIds },
          revoked_at: null,
          deleted_at: null,
          expires_at: { gt: now },
        },
        data: {
          revoked_at: now,
          revoked_reason: reason,
          updated_at: now,
        },
      }),
    ]);

  // Upsert revocation records per session (idempotent)
  await Promise.all(
    targetSessionIds.map((sid) =>
      MyGlobal.prisma.todo_app_session_revocations.upsert({
        where: { todo_app_session_id: sid },
        update: {
          revoked_at: now,
          revoked_by: "systemadmin",
          reason: reason ?? undefined,
          updated_at: now,
          deleted_at: null,
        },
        create: {
          id: v4(),
          todo_app_session_id: sid,
          revoked_at: now,
          revoked_by: "systemadmin",
          reason: reason ?? undefined,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      }),
    ),
  );

  // Audit log for governance
  await MyGlobal.prisma.todo_app_audit_logs.create({
    data: {
      id: v4(),
      actor_user_id: systemAdmin.id,
      target_user_id: null,
      action: "system_admin_sessions_revoke",
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

  return {
    success: true,
    revoked_sessions_count: updatedSessions.count,
    revoked_session_ids: targetSessionIds,
    revoked_refresh_tokens_count: updatedRefreshTokens.count,
    message:
      updatedSessions.count === 0
        ? "No sessions matched revocation criteria."
        : `Revoked ${updatedSessions.count} session(s) and ${updatedRefreshTokens.count} refresh token(s).`,
  };
}
