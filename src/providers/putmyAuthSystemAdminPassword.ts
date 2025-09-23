import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppSystemAdminPassword } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminPassword";
import { ITodoAppSystemAdminPasswordChangeResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminPasswordChangeResult";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Change own system administrator password.
 *
 * Verifies the provided current password against the authenticated admin's
 * todo_app_users.password_hash, then updates the hash to the new password. By
 * policy, revokes active sessions belonging to the same user and records
 * revocation entries in todo_app_session_revocations.
 *
 * Authorization: requires authenticated System Admin; additionally validates
 * active, non-revoked membership and that the owning user is active, verified,
 * and not soft-deleted.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system admin payload (user id
 *   and role)
 * @param props.body - Payload containing current_password and new_password
 * @returns Acknowledgment with optional metadata about session revocations
 * @throws {HttpException} 401 when authentication payload is missing
 * @throws {HttpException} 403 when membership is invalid or user is not
 *   active/verified
 * @throws {HttpException} 400 when current password mismatches or new password
 *   violates policy
 */
export async function putmyAuthSystemAdminPassword(props: {
  systemAdmin: SystemadminPayload;
  body: ITodoAppSystemAdminPassword.IUpdate;
}): Promise<ITodoAppSystemAdminPasswordChangeResult> {
  const { systemAdmin, body } = props;

  // Basic presence check for authentication context
  if (!systemAdmin || !systemAdmin.id || systemAdmin.type !== "systemadmin") {
    throw new HttpException("Unauthorized", 401);
  }

  // Validate active system admin membership and owning user state
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
  if (membership === null) {
    throw new HttpException("Forbidden", 403);
  }

  // Load user for password verification
  const user = await MyGlobal.prisma.todo_app_users.findUniqueOrThrow({
    where: { id: systemAdmin.id },
    select: {
      id: true,
      password_hash: true,
      status: true,
      email_verified: true,
      deleted_at: true,
    },
  });
  if (
    user.deleted_at !== null ||
    user.status !== "active" ||
    !user.email_verified
  ) {
    throw new HttpException("Forbidden", 403);
  }

  // Validate current password
  const matches = await MyGlobal.password.verify(
    body.current_password,
    user.password_hash,
  );
  if (!matches) {
    throw new HttpException("Bad Request: Current password is incorrect", 400);
  }

  // Enforce minimal password policy (8–64 chars) in addition to DTO-level validation
  if (
    typeof body.new_password !== "string" ||
    body.new_password.length < 8 ||
    body.new_password.length > 64
  ) {
    throw new HttpException(
      "Bad Request: New password does not meet policy",
      400,
    );
  }

  const now = toISOStringSafe(new Date());
  const newHash = await MyGlobal.password.hash(body.new_password);

  // Execute credential update and session revocations atomically
  const result = await MyGlobal.prisma.$transaction(async (tx) => {
    // Update user password
    await tx.todo_app_users.update({
      where: { id: systemAdmin.id },
      data: {
        password_hash: newHash,
        updated_at: now,
      },
    });

    // Gather active sessions to revoke (may include current session)
    const sessions = await tx.todo_app_sessions.findMany({
      where: {
        todo_app_user_id: systemAdmin.id,
        revoked_at: null,
        deleted_at: null,
      },
      select: { id: true },
    });

    let revokedCount = 0;
    if (sessions.length > 0) {
      // Revoke in session table
      const updateRes = await tx.todo_app_sessions.updateMany({
        where: {
          todo_app_user_id: systemAdmin.id,
          revoked_at: null,
          deleted_at: null,
        },
        data: {
          revoked_at: now,
          revoked_reason: "password_change",
          updated_at: now,
        },
      });
      revokedCount = updateRes.count;

      // Insert revocation audit rows (one per session)
      await Promise.all(
        sessions.map((s) =>
          tx.todo_app_session_revocations.create({
            data: {
              id: v4(),
              todo_app_session_id: s.id,
              revoked_at: now,
              revoked_by: "admin",
              reason: "Password changed by owner",
              created_at: now,
              updated_at: now,
            },
          }),
        ),
      );
    }

    return {
      success: true,
      revoked_other_sessions: revokedCount > 0 ? true : undefined,
      revoked_sessions_count: revokedCount > 0 ? revokedCount : undefined,
      message:
        revokedCount > 0
          ? `Password updated; ${revokedCount} session(s) revoked`
          : "Password updated",
    } as ITodoAppSystemAdminPasswordChangeResult;
  });

  return result;
}
