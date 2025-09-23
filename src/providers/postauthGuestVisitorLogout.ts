import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppSessionRevocation } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSessionRevocation";
import { GuestvisitorPayload } from "../decorators/payload/GuestvisitorPayload";

/**
 * Revoke current session in todo_app_sessions and create
 * todo_app_session_revocations for guestVisitor logout.
 *
 * This operation marks the caller's latest active session as revoked, records a
 * single revocation entry per session, and invalidates all refresh tokens in
 * that session's chain. Idempotent: repeated calls return the same revocation
 * summary without changing state again.
 *
 * @param props - Request properties
 * @param props.guestVisitor - Authenticated guest visitor payload (top-level
 *   user id)
 * @param props.body - Optional human-readable reason for revocation
 * @returns Summary of the recorded session revocation
 * @throws {HttpException} 403 When user is not an active guest visitor
 * @throws {HttpException} 401 When no session context exists for the user
 */
export async function postauthGuestVisitorLogout(props: {
  guestVisitor: GuestvisitorPayload;
  body: ITodoAppSessionRevocation.ICreate;
}): Promise<ITodoAppSessionRevocation.ISummary> {
  const { guestVisitor, body } = props;

  // Authorization check: ensure user holds an active guestvisitor assignment
  const guestAssignment =
    await MyGlobal.prisma.todo_app_guestvisitors.findFirst({
      where: {
        todo_app_user_id: guestVisitor.id,
        revoked_at: null,
        deleted_at: null,
        user: {
          is: {
            deleted_at: null,
            status: "active",
          },
        },
      },
    });
  if (!guestAssignment) {
    throw new HttpException(
      "Unauthorized: You are not an active guest visitor",
      403,
    );
  }

  // Find latest active session for this user (current session context)
  const activeSession = await MyGlobal.prisma.todo_app_sessions.findFirst({
    where: {
      todo_app_user_id: guestVisitor.id,
      revoked_at: null,
      deleted_at: null,
    },
    orderBy: { issued_at: "desc" },
  });

  const now = toISOStringSafe(new Date());
  const reasonValue = body.reason ?? null;

  if (activeSession) {
    // Revoke session, upsert revocation (no-op update for idempotency), and revoke refresh token chain
    const [, revocation] = await MyGlobal.prisma.$transaction([
      MyGlobal.prisma.todo_app_sessions.update({
        where: { id: activeSession.id },
        data: {
          revoked_at: now,
          revoked_reason: reasonValue,
          updated_at: now,
        },
      }),
      MyGlobal.prisma.todo_app_session_revocations.upsert({
        where: { todo_app_session_id: activeSession.id },
        create: {
          id: v4() as string & tags.Format<"uuid">,
          todo_app_session_id: activeSession.id,
          revoked_at: now,
          revoked_by: "user",
          reason: reasonValue,
          created_at: now,
          updated_at: now,
        },
        update: {}, // preserve original record to keep revoked_at/id stable
      }),
      MyGlobal.prisma.todo_app_refresh_tokens.updateMany({
        where: {
          todo_app_session_id: activeSession.id,
          revoked_at: null,
          deleted_at: null,
        },
        data: {
          revoked_at: now,
          revoked_reason: reasonValue,
          updated_at: now,
        },
      }),
    ]);

    return {
      id: revocation.id as string & tags.Format<"uuid">,
      todo_app_session_id: revocation.todo_app_session_id as string &
        tags.Format<"uuid">,
      revoked_at: toISOStringSafe(revocation.revoked_at),
      revoked_by: revocation.revoked_by,
      reason: revocation.reason ?? null,
      created_at: toISOStringSafe(revocation.created_at),
      updated_at: toISOStringSafe(revocation.updated_at),
    };
  }

  // Already revoked or no active session; find most recently revoked session and its revocation
  const lastRevokedSession = await MyGlobal.prisma.todo_app_sessions.findFirst({
    where: {
      todo_app_user_id: guestVisitor.id,
      revoked_at: { not: null },
      deleted_at: null,
    },
    orderBy: { revoked_at: "desc" },
  });
  if (!lastRevokedSession) {
    throw new HttpException("Unauthorized: No session to revoke", 401);
  }

  const existingRevocation =
    await MyGlobal.prisma.todo_app_session_revocations.findUnique({
      where: { todo_app_session_id: lastRevokedSession.id },
    });
  if (existingRevocation) {
    return {
      id: existingRevocation.id as string & tags.Format<"uuid">,
      todo_app_session_id: existingRevocation.todo_app_session_id as string &
        tags.Format<"uuid">,
      revoked_at: toISOStringSafe(existingRevocation.revoked_at),
      revoked_by: existingRevocation.revoked_by,
      reason: existingRevocation.reason ?? null,
      created_at: toISOStringSafe(existingRevocation.created_at),
      updated_at: toISOStringSafe(existingRevocation.updated_at),
    };
  }

  // Edge case: session was revoked but revocation record missing → create one aligned to session.revoked_at
  const revokedAt = lastRevokedSession.revoked_at
    ? toISOStringSafe(lastRevokedSession.revoked_at)
    : now;
  const created = await MyGlobal.prisma.todo_app_session_revocations.create({
    data: {
      id: v4() as string & tags.Format<"uuid">,
      todo_app_session_id: lastRevokedSession.id,
      revoked_at: revokedAt,
      revoked_by: "user",
      reason: reasonValue,
      created_at: now,
      updated_at: now,
    },
  });

  return {
    id: created.id as string & tags.Format<"uuid">,
    todo_app_session_id: created.todo_app_session_id as string &
      tags.Format<"uuid">,
    revoked_at: toISOStringSafe(created.revoked_at),
    revoked_by: created.revoked_by,
    reason: created.reason ?? null,
    created_at: toISOStringSafe(created.created_at),
    updated_at: toISOStringSafe(created.updated_at),
  };
}
