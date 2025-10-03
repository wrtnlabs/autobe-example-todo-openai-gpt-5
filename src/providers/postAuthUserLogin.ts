import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ITodoMvpUserLogin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUserLogin";
import { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";
import { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";

export async function postAuthUserLogin(props: {
  body: ITodoMvpUserLogin.IRequest;
}): Promise<ITodoMvpUser.IAuthorized> {
  const { body } = props;

  // 1) Lookup user by unique email
  const user = await MyGlobal.prisma.todo_mvp_users.findUnique({
    where: { email: body.email },
  });
  if (!user) {
    throw new HttpException("Unauthorized: Invalid email or password", 401);
  }

  // 2) Verify password
  const passwordOk = await PasswordUtil.verify(
    body.password,
    user.password_hash,
  );
  if (!passwordOk) {
    throw new HttpException("Unauthorized: Invalid email or password", 401);
  }

  // 3) Account status and soft-delete checks
  if (user.status !== "active") {
    throw new HttpException("Forbidden: Account is not active", 403);
  }
  if (user.deleted_at) {
    throw new HttpException("Forbidden: Account has been deleted", 403);
  }

  // 4) Timestamps for token/session lifecycle
  const nowIso = toISOStringSafe(new Date());
  const accessExpIso = toISOStringSafe(new Date(Date.now() + 60 * 60 * 1000)); // 1h
  const refreshExpIso = toISOStringSafe(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  ); // 7d

  // 5) JWT payloads and issuance
  const accessToken = jwt.sign(
    {
      id: user.id,
      type: "user",
      email: user.email,
      status: user.status,
      created_at: toISOStringSafe(user.created_at),
      updated_at: toISOStringSafe(user.updated_at),
    },
    MyGlobal.env.JWT_SECRET_KEY,
    { expiresIn: "1h", issuer: "autobe" },
  );

  const refreshToken = jwt.sign(
    {
      id: user.id,
      type: "user",
      tokenType: "refresh",
    },
    MyGlobal.env.JWT_SECRET_KEY,
    { expiresIn: "7d", issuer: "autobe" },
  );

  // 6) Persist session with hashed refresh token
  const sessionId = v4();
  const sessionTokenHash = await PasswordUtil.hash(refreshToken);
  await MyGlobal.prisma.todo_mvp_sessions.create({
    data: {
      id: sessionId,
      todo_mvp_user_id: user.id,
      todo_mvp_admin_id: null,
      session_token_hash: sessionTokenHash,
      created_at: nowIso,
      updated_at: nowIso,
      last_accessed_at: nowIso,
      expires_at: refreshExpIso,
      revoked_at: null,
    },
  });

  // 7) Build response
  const authorized: ITodoMvpUser.IAuthorized = {
    id: user.id as string & tags.Format<"uuid">,
    email: user.email as string & tags.Format<"email">,
    status: (user.status === "active" ? "active" : "deactivated") as
      | "active"
      | "deactivated",
    created_at: toISOStringSafe(user.created_at),
    updated_at: toISOStringSafe(user.updated_at),
    deleted_at: user.deleted_at ? toISOStringSafe(user.deleted_at) : null,
    token: {
      access: accessToken,
      refresh: refreshToken,
      expired_at: accessExpIso,
      refreshable_until: refreshExpIso,
    },
    user: {
      id: user.id as string & tags.Format<"uuid">,
      email: user.email as string & tags.Format<"email">,
      status: (user.status === "active" ? "active" : "deactivated") as
        | "active"
        | "deactivated",
      created_at: toISOStringSafe(user.created_at),
      updated_at: toISOStringSafe(user.updated_at),
    },
  };

  return authorized;
}
