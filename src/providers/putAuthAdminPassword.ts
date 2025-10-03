import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ITodoMvpAdminPassword } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdminPassword";
import { ITodoMvpAdminSecurityResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdminSecurityResult";
import { AdminPayload } from "../decorators/payload/AdminPayload";

/**
 * Update Actors.todo_mvp_admins.password_hash for the authenticated admin.
 *
 * Verifies the current password, hashes the new password, and updates the admin
 * record's password_hash and updated_at. This operation is restricted to the
 * authenticated admin (props.admin). Optionally, providers may revoke other
 * sessions; this implementation keeps existing sessions as-is to allow current
 * session continuity and signals reauth policy via the response.
 *
 * @param props - Request properties
 * @param props.admin - Authenticated admin payload (id, type="admin")
 * @param props.body - DTO with current_password and new_password
 * @returns Security result indicating operation outcome and re-auth policy
 * @throws {HttpException} 403 when admin is not active or soft-deleted
 * @throws {HttpException} 400 when current password is invalid or new password
 *   policy fails
 */
export async function putAuthAdminPassword(props: {
  admin: AdminPayload;
  body: ITodoMvpAdminPassword.IUpdate;
}): Promise<ITodoMvpAdminSecurityResult> {
  const { admin, body } = props;

  // Basic password policy (can be strengthened as needed)
  if (!body.new_password || body.new_password.length < 8)
    throw new HttpException("Bad Request: New password too short", 400);

  // Ensure the admin exists, is active, and not soft-deleted
  const record = await MyGlobal.prisma.todo_mvp_admins.findFirst({
    where: {
      id: admin.id,
      status: "active",
      deleted_at: null,
    },
  });
  if (record === null)
    throw new HttpException("Forbidden: Admin not found or inactive", 403);

  // Verify current password against stored hash
  const ok = await PasswordUtil.verify(
    body.current_password,
    record.password_hash,
  );
  if (!ok)
    throw new HttpException("Bad Request: Current password is incorrect", 400);

  // Hash new password and update admin's credential + updated_at
  const newHash = await PasswordUtil.hash(body.new_password);
  await MyGlobal.prisma.todo_mvp_admins.update({
    where: { id: record.id },
    data: {
      password_hash: newHash,
      updated_at: toISOStringSafe(new Date()),
    },
  });

  // Policy choice: keep current session valid; do not revoke other sessions here
  return {
    success: true,
    reauth_required: false,
  };
}
