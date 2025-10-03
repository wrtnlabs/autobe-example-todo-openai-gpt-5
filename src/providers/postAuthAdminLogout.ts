import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { AdminPayload } from "../decorators/payload/AdminPayload";

export async function postAuthAdminLogout(props: {
  admin: AdminPayload;
}): Promise<void> {
  const { admin } = props;

  // Authorization and actor validation (must be active and not soft-deleted)
  if (admin.type !== "admin") {
    throw new HttpException("Forbidden: Invalid role for this endpoint", 403);
  }

  const adminRecord = await MyGlobal.prisma.todo_mvp_admins.findFirst({
    where: {
      id: admin.id,
      deleted_at: null,
      status: "active",
    },
    select: { id: true },
  });

  if (!adminRecord) {
    throw new HttpException("Forbidden: Admin not found or inactive", 403);
  }

  // Determine the current active session for this admin
  const now = toISOStringSafe(new Date());

  const session = await MyGlobal.prisma.todo_mvp_sessions.findFirst({
    where: {
      todo_mvp_admin_id: admin.id,
      revoked_at: null,
      expires_at: { gt: now },
    },
    orderBy: { last_accessed_at: "desc" },
    select: { id: true },
  });

  // Idempotent: if no active session found, treat as already logged out
  if (!session) return;

  await MyGlobal.prisma.todo_mvp_sessions.update({
    where: { id: session.id },
    data: {
      revoked_at: now,
      updated_at: now,
    },
  });

  return;
}
