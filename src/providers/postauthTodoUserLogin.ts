import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppTodoUserLogin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserLogin";
import { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Login for todoUser using todo_app_users; creates todo_app_sessions and
 * todo_app_refresh_tokens and logs attempts.
 *
 * Authenticates a user identified by todo_app_users.email using the submitted
 * password. On success, it verifies active role membership (todo_app_todousers
 * with revoked_at IS NULL), creates a session and refresh token chain, updates
 * last_login_at, records the login attempt, and returns JWT access/refresh
 * tokens with expiration metadata.
 *
 * Security notes:
 *
 * - Failure responses are generic and do not disclose account existence.
 * - All timestamps are ISO 8601 strings; no native Date types are used.
 * - Session and refresh token rows are persisted for revocation/rotation
 *   workflows.
 *
 * @param props - Request properties
 * @param props.body - Login payload containing email, password, and optional
 *   keep_me_signed_in flag
 * @returns Authorized context with subject id and token information
 * @throws {HttpException} 401 when authentication fails (invalid credentials or
 *   policy gating)
 * @throws {HttpException} 500 when unexpected errors occur
 */
export async function postauthTodoUserLogin(props: {
  body: ITodoAppTodoUserLogin.IRequest;
}): Promise<ITodoAppTodoUser.IAuthorized> {
  const { body } = props;

  // Current timestamps
  const now = toISOStringSafe(new Date());
  const accessExpiredAt = toISOStringSafe(
    new Date(Date.now() + 60 * 60 * 1000),
  ); // 1h
  const refreshTtlMs =
    (body.keep_me_signed_in === true ? 30 : 7) * 24 * 60 * 60 * 1000; // 30d or 7d
  const refreshExpiredAt = toISOStringSafe(new Date(Date.now() + refreshTtlMs));

  // Required IP (schema requires non-null string). No request context available -> use generic.
  const ip = "unknown";
  const userAgent: string | null = null;

  // Find user by email (excluding soft-deleted)
  const user = await MyGlobal.prisma.todo_app_users.findFirst({
    where: {
      email: body.email,
      deleted_at: null,
    },
  });

  // Helper to record login attempt
  const recordAttempt = async (
    success: boolean,
    failure_reason: string | null,
    todo_app_user_id: string | null,
  ) => {
    await MyGlobal.prisma.todo_app_login_attempts.create({
      data: {
        id: v4(),
        todo_app_user_id,
        email: body.email,
        success,
        ip,
        user_agent: userAgent,
        failure_reason,
        occurred_at: now,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    });
  };

  // Credential and policy checks
  let authenticated = false;
  if (user) {
    const passwordOk = await MyGlobal.password.verify(
      body.password,
      user.password_hash,
    );
    if (
      passwordOk &&
      user.status === "active" &&
      user.email_verified === true
    ) {
      const role = await MyGlobal.prisma.todo_app_todousers.findFirst({
        where: {
          todo_app_user_id: user.id,
          revoked_at: null,
          deleted_at: null,
        },
      });
      authenticated = !!role;
    }
  }

  if (!authenticated) {
    await recordAttempt(false, "invalid_credentials", user ? user.id : null);
    throw new HttpException("Unauthorized: Invalid credentials", 401);
  }

  // Issue tokens
  const accessToken = jwt.sign(
    {
      id: user!.id,
      type: "todouser",
    },
    MyGlobal.env.JWT_SECRET_KEY,
    {
      expiresIn: "1h",
      issuer: "autobe",
    },
  );

  const refreshToken = jwt.sign(
    {
      id: user!.id,
      type: "todouser",
      tokenType: "refresh",
    },
    MyGlobal.env.JWT_SECRET_KEY,
    {
      expiresIn: body.keep_me_signed_in === true ? "30d" : "7d",
      issuer: "autobe",
    },
  );

  // Persist session and refresh token chain
  const sessionId = v4();
  const sessionToken = v4();
  const refreshTokenHash = await MyGlobal.password.hash(refreshToken);

  await MyGlobal.prisma.todo_app_sessions.create({
    data: {
      id: sessionId,
      todo_app_user_id: user!.id,
      session_token: sessionToken,
      ip: ip,
      user_agent: userAgent,
      issued_at: now,
      expires_at: refreshExpiredAt,
      revoked_at: null,
      revoked_reason: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
  });

  await MyGlobal.prisma.todo_app_refresh_tokens.create({
    data: {
      id: v4(),
      todo_app_session_id: sessionId,
      parent_id: null,
      token: refreshToken,
      token_hash: refreshTokenHash,
      issued_at: now,
      expires_at: refreshExpiredAt,
      rotated_at: null,
      revoked_at: null,
      revoked_reason: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
  });

  // Update last_login_at
  await MyGlobal.prisma.todo_app_users.update({
    where: { id: user!.id },
    data: {
      last_login_at: now,
      updated_at: now,
    },
  });

  // Record success attempt
  await recordAttempt(true, null, user!.id);

  return {
    id: user!.id as string & tags.Format<"uuid">,
    token: {
      access: accessToken,
      refresh: refreshToken,
      expired_at: accessExpiredAt,
      refreshable_until: refreshExpiredAt,
    },
  };
}
