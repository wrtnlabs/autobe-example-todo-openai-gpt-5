import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppSystemAdminLogin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminLogin";
import { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";

/**
 * Login a systemAdmin via todo_app_users and issue session/refresh artifacts.
 *
 * Authenticates a system administrator using email and password, verifies the
 * account holds an active systemadmin role, creates a new session and refresh
 * token records, updates the user's last_login_at, and returns JWT tokens for
 * access and refresh. Tokens are signed with issuer 'autobe'.
 *
 * @param props - Request properties
 * @param props.body - Login credentials and optional client context
 * @returns Authorized admin identity and tokens
 * @throws {HttpException} 401 Invalid credentials or not an active admin
 */
export async function postauthSystemAdminLogin(props: {
  body: ITodoAppSystemAdminLogin.ICreate;
}): Promise<ITodoAppSystemAdmin.IAuthorized> {
  const { body } = props;

  // 1) Locate user by email (exclude soft-deleted)
  const user = await MyGlobal.prisma.todo_app_users.findFirst({
    where: {
      email: body.email,
      deleted_at: null,
    },
  });
  if (!user) throw new HttpException("Invalid credentials", 401);

  // 2) Password verification
  const ok = await MyGlobal.password.verify(body.password, user.password_hash);
  if (!ok) throw new HttpException("Invalid credentials", 401);

  // 3) Ensure user has an active system admin role (not revoked)
  const admin = await MyGlobal.prisma.todo_app_systemadmins.findFirst({
    where: {
      todo_app_user_id: user.id,
      revoked_at: null,
      deleted_at: null,
    },
  });
  if (!admin) throw new HttpException("Invalid credentials", 401);

  // 4) Prepare identifiers and timestamps
  const sessionId = v4() as string & tags.Format<"uuid">;
  const refreshId = v4() as string & tags.Format<"uuid">;
  const sessionToken = v4();

  const issuedAt = toISOStringSafe(new Date());
  const accessExpiresAt = toISOStringSafe(
    new Date(Date.now() + 60 * 60 * 1000),
  );
  const refreshExpiresAt = toISOStringSafe(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  );

  // 5) JWT tokens (payload conforms to SystemadminPayload)
  const accessToken = jwt.sign(
    { id: user.id, type: "systemadmin" },
    MyGlobal.env.JWT_SECRET_KEY,
    { expiresIn: "1h", issuer: "autobe" },
  );
  const refreshToken = jwt.sign(
    { id: user.id, type: "systemadmin", tokenType: "refresh" },
    MyGlobal.env.JWT_SECRET_KEY,
    { expiresIn: "7d", issuer: "autobe" },
  );

  // 6) Persist session and refresh token, and update user's last_login_at
  const refreshTokenHash = await MyGlobal.password.hash(refreshToken);
  await MyGlobal.prisma.$transaction([
    MyGlobal.prisma.todo_app_sessions.create({
      data: {
        id: sessionId,
        todo_app_user_id: user.id,
        session_token: sessionToken,
        ip: body.ip ?? null,
        user_agent: body.user_agent ?? null,
        issued_at: issuedAt,
        expires_at: accessExpiresAt,
        revoked_at: null,
        revoked_reason: null,
        created_at: issuedAt,
        updated_at: issuedAt,
        deleted_at: null,
      },
    }),
    MyGlobal.prisma.todo_app_refresh_tokens.create({
      data: {
        id: refreshId,
        todo_app_session_id: sessionId,
        parent_id: null,
        token: refreshToken,
        token_hash: refreshTokenHash,
        issued_at: issuedAt,
        expires_at: refreshExpiresAt,
        rotated_at: null,
        revoked_at: null,
        revoked_reason: null,
        created_at: issuedAt,
        updated_at: issuedAt,
        deleted_at: null,
      },
    }),
    MyGlobal.prisma.todo_app_users.update({
      where: { id: user.id },
      data: {
        last_login_at: issuedAt,
        updated_at: issuedAt,
      },
    }),
  ]);

  return {
    id: user.id as string & tags.Format<"uuid">,
    token: {
      access: accessToken,
      refresh: refreshToken,
      expired_at: accessExpiresAt,
      refreshable_until: refreshExpiresAt,
    },
  };
}
