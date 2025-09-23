import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppSystemAdminLogout } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminLogout";
import { ITodoAppSystemAdminLogoutResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminLogoutResult";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Logout current admin by revoking session and refresh token per schema.
 *
 * This operation revokes the authenticated system administrator's current
 * session. It will:
 *
 * - Verify the caller is an active system administrator
 * - Revoke the latest active session (revoked_at, revoked_reason)
 * - Revoke any refresh tokens tied to that session
 * - Create (or update) a session revocation record
 * - Be idempotent on repeated calls
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated System Admin payload
 * @param props.body - Optional context including a human-readable reason
 * @returns Revocation summary containing session id, timestamp, actor, and
 *   optional reason
 * @throws {HttpException} 403 when the caller is not an active system
 *   administrator
 * @throws {HttpException} 404 when no session exists for this administrator
 */
export async function postmyAuthSystemAdminLogout(props: {
  systemAdmin: SystemadminPayload;
  body: ITodoAppSystemAdminLogout.ICreate;
}): Promise<ITodoAppSystemAdminLogoutResult> {
  const { systemAdmin, body } = props;

  // Authorization: ensure active system admin membership and active user
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
  if (!membership)
    throw new HttpException(
      "Unauthorized: not an active system administrator",
      403,
    );

  // Determine target session (prefer active/unrevoked, else most recent for idempotency)
  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());

  const active = await MyGlobal.prisma.todo_app_sessions.findFirst({
    where: {
      todo_app_user_id: systemAdmin.id,
      revoked_at: null,
      deleted_at: null,
      expires_at: { gt: now },
    },
    orderBy: { created_at: "desc" },
  });

  const target =
    active ??
    (await MyGlobal.prisma.todo_app_sessions.findFirst({
      where: {
        todo_app_user_id: systemAdmin.id,
        deleted_at: null,
      },
      orderBy: { created_at: "desc" },
    }));

  if (!target)
    throw new HttpException(
      "Not Found: no session exists for this administrator",
      404,
    );

  const sessionId = target.id as string & tags.Format<"uuid">;

  // Idempotent revocation steps inside a transaction
  await MyGlobal.prisma.$transaction([
    // Revoke session (only if not already revoked)
    MyGlobal.prisma.todo_app_sessions.updateMany({
      where: { id: sessionId, revoked_at: null, deleted_at: null },
      data: {
        revoked_at: now,
        revoked_reason: body.reason === undefined ? undefined : body.reason,
        updated_at: now,
      },
    }),
    // Revoke any active refresh tokens for this session
    MyGlobal.prisma.todo_app_refresh_tokens.updateMany({
      where: {
        todo_app_session_id: sessionId,
        revoked_at: null,
        deleted_at: null,
      },
      data: {
        revoked_at: now,
        revoked_reason: body.reason === undefined ? undefined : body.reason,
        updated_at: now,
      },
    }),
    // Record session revocation (upsert by unique session_id)
    MyGlobal.prisma.todo_app_session_revocations.upsert({
      where: { todo_app_session_id: sessionId },
      create: {
        id: v4() as string & tags.Format<"uuid">,
        todo_app_session_id: sessionId,
        revoked_at: now,
        revoked_by: "admin",
        reason: body.reason ?? null,
        created_at: now,
        updated_at: now,
      },
      update: {
        revoked_at: now,
        revoked_by: "admin",
        reason: body.reason === undefined ? undefined : body.reason,
        updated_at: now,
      },
    }),
  ]);

  return {
    session_id: sessionId,
    revoked_at: now,
    revoked_by: "admin",
    reason: body.reason === undefined ? undefined : body.reason,
    message: "Session revoked successfully",
  };
}
