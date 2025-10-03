import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ITodoMvpAdminLogin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdminLogin";
import { ITodoMvpAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdmin";
import { IEAdminStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAdminStatus";
import { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";

export async function postAuthAdminLogin(props: {
  body: ITodoMvpAdminLogin.ICreate;
}): Promise<ITodoMvpAdmin.IAuthorized> {
  const { email, password } = props.body;

  // 1) Find admin by unique email
  const admin = await MyGlobal.prisma.todo_mvp_admins.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      password_hash: true,
      status: true,
      created_at: true,
      updated_at: true,
      deleted_at: true,
    },
  });

  // Do not reveal which part failed
  if (!admin) throw new HttpException("Invalid credentials", 401);

  // 2) Verify password
  const valid = await PasswordUtil.verify(password, admin.password_hash);
  if (!valid) throw new HttpException("Invalid credentials", 401);

  // 3) Enforce account status and soft-delete policy
  if (admin.status !== "active") {
    throw new HttpException("Forbidden: Account is not active", 403);
  }
  if (admin.deleted_at) {
    throw new HttpException("Forbidden: Account is deleted", 403);
  }

  // 4) Issue JWT tokens
  const nowMs = Date.now();
  const nowIso = toISOStringSafe(new Date(nowMs));
  const accessExpMs = nowMs + 60 * 60 * 1000; // 1 hour
  const refreshExpMs = nowMs + 7 * 24 * 60 * 60 * 1000; // 7 days

  const accessToken = jwt.sign(
    {
      id: admin.id,
      type: "admin",
    },
    MyGlobal.env.JWT_SECRET_KEY,
    { expiresIn: "1h", issuer: "autobe" },
  );

  const refreshToken = jwt.sign(
    {
      id: admin.id,
      type: "admin",
      tokenType: "refresh",
    },
    MyGlobal.env.JWT_SECRET_KEY,
    { expiresIn: "7d", issuer: "autobe" },
  );

  const accessExpiredAt = toISOStringSafe(new Date(accessExpMs));
  const refreshableUntil = toISOStringSafe(new Date(refreshExpMs));

  // 5) Persist/rotate session (store hash of refresh token)
  const sessionTokenHash = await PasswordUtil.hash(refreshToken);
  await MyGlobal.prisma.todo_mvp_sessions.create({
    data: {
      id: v4(),
      todo_mvp_user_id: null,
      todo_mvp_admin_id: admin.id,
      session_token_hash: sessionTokenHash,
      created_at: nowIso,
      updated_at: nowIso,
      last_accessed_at: nowIso,
      expires_at: refreshableUntil,
      revoked_at: null,
    },
  });

  // 6) Build response adhering to DTO contracts
  const status: IEAdminStatus =
    admin.status === "active" ? "active" : "deactivated";

  return {
    id: admin.id as string & tags.Format<"uuid">,
    email: admin.email as string & tags.Format<"email">,
    status,
    created_at: toISOStringSafe(admin.created_at),
    updated_at: toISOStringSafe(admin.updated_at),
    deleted_at: admin.deleted_at ? toISOStringSafe(admin.deleted_at) : null,
    token: {
      access: accessToken,
      refresh: refreshToken,
      expired_at: accessExpiredAt,
      refreshable_until: refreshableUntil,
    },
  };
}
