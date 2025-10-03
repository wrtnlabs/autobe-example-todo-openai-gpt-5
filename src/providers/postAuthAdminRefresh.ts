import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ITodoMvpAdminRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdminRefresh";
import { ITodoMvpAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdmin";
import { IEAdminStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAdminStatus";
import { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";

/**
 * Refresh admin authorization by rotating Auth.todo_mvp_sessions tied to
 * Actors.todo_mvp_admins.
 *
 * @param props - Contains body with refresh_token
 * @returns Authorized admin payload with refreshed tokens
 * @throws {HttpException} 401 Invalid/expired token; 403 when admin is not
 *   active
 */
export async function postAuthAdminRefresh(props: {
  body: ITodoMvpAdminRefresh.ICreate;
}): Promise<ITodoMvpAdmin.IAuthorized> {
  const { body } = props;
  const refreshToken: string = body.refresh_token;

  const nowIso: string & tags.Format<"date-time"> = toISOStringSafe(new Date());

  // Optional JWT verification; continue with hash-based validation regardless
  try {
    jwt.verify(refreshToken, MyGlobal.env.JWT_SECRET_KEY, { issuer: "autobe" });
  } catch {
    // ignore verification failure and proceed to hash validation
  }

  const candidates = await MyGlobal.prisma.todo_mvp_sessions.findMany({
    where: {
      todo_mvp_admin_id: { not: null },
      revoked_at: null,
      expires_at: { gt: nowIso },
    },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      todo_mvp_admin_id: true,
      session_token_hash: true,
      revoked_at: true,
      expires_at: true,
    },
  });

  let matched: {
    id: string;
    todo_mvp_admin_id: string | null;
    session_token_hash: string;
  } | null = null;
  for (const s of candidates) {
    // Verify provided token matches stored hash
    // eslint-disable-next-line no-await-in-loop
    const ok = await PasswordUtil.verify(refreshToken, s.session_token_hash);
    if (ok) {
      matched = {
        id: s.id,
        todo_mvp_admin_id: s.todo_mvp_admin_id,
        session_token_hash: s.session_token_hash,
      };
      break;
    }
  }

  if (!matched || matched.todo_mvp_admin_id === null) {
    throw new HttpException(
      "Unauthorized: Invalid or expired refresh token",
      401,
    );
  }

  const admin = await MyGlobal.prisma.todo_mvp_admins.findUniqueOrThrow({
    where: { id: matched.todo_mvp_admin_id },
    select: {
      id: true,
      email: true,
      status: true,
      created_at: true,
      updated_at: true,
      deleted_at: true,
    },
  });

  if (admin.status !== "active") {
    throw new HttpException("Forbidden: Admin account is not active", 403);
  }

  // Policy defaults (avoid referencing non-existent env keys that cause TS errors)
  const accessTtlSeconds = 3600; // 1 hour
  const refreshTtlSeconds = 7 * 24 * 3600; // 7 days

  const accessExpiredAt: string & tags.Format<"date-time"> = toISOStringSafe(
    new Date(Date.now() + accessTtlSeconds * 1000),
  );
  const refreshableUntil: string & tags.Format<"date-time"> = toISOStringSafe(
    new Date(Date.now() + refreshTtlSeconds * 1000),
  );

  const accessToken: string = jwt.sign(
    { id: admin.id, type: "admin" },
    MyGlobal.env.JWT_SECRET_KEY,
    {
      issuer: "autobe",
      expiresIn: accessTtlSeconds,
    },
  );

  const newRefreshToken: string = jwt.sign(
    { sid: matched.id, type: "refresh", role: "admin" },
    MyGlobal.env.JWT_SECRET_KEY,
    {
      issuer: "autobe",
      expiresIn: refreshTtlSeconds,
    },
  );

  const newHash: string = await PasswordUtil.hash(newRefreshToken);

  await MyGlobal.prisma.todo_mvp_sessions.update({
    where: { id: matched.id },
    data: {
      session_token_hash: newHash,
      last_accessed_at: nowIso,
      updated_at: nowIso,
      expires_at: refreshableUntil,
    },
    select: { id: true },
  });

  return {
    id: admin.id as string & tags.Format<"uuid">,
    email: admin.email as string & tags.Format<"email">,
    status: admin.status as IEAdminStatus,
    created_at: toISOStringSafe(admin.created_at) as string &
      tags.Format<"date-time">,
    updated_at: toISOStringSafe(admin.updated_at) as string &
      tags.Format<"date-time">,
    deleted_at: admin.deleted_at
      ? (toISOStringSafe(admin.deleted_at) as string & tags.Format<"date-time">)
      : null,
    token: {
      access: accessToken,
      refresh: newRefreshToken,
      expired_at: accessExpiredAt as string & tags.Format<"date-time">,
      refreshable_until: refreshableUntil as string & tags.Format<"date-time">,
    },
    admin: {
      id: admin.id as string & tags.Format<"uuid">,
      email: admin.email as string & tags.Format<"email">,
      status: admin.status as IEAccountStatus,
      created_at: toISOStringSafe(admin.created_at) as string &
        tags.Format<"date-time">,
      updated_at: toISOStringSafe(admin.updated_at) as string &
        tags.Format<"date-time">,
      deleted_at: admin.deleted_at
        ? (toISOStringSafe(admin.deleted_at) as string &
            tags.Format<"date-time">)
        : null,
    },
  };
}
