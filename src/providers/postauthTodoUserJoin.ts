import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Register a new member (todoUser) and issue authentication tokens.
 *
 * Creates a user in todo_app_users, assigns the todoUser role, opens a session,
 * creates the initial refresh token, records a successful login attempt, and
 * returns access/refresh tokens with expiration metadata.
 *
 * Security:
 *
 * - Password is hashed with MyGlobal.password.hash before persisting.
 * - Email uniqueness is enforced; duplicate attempts return 409.
 * - All DateTime fields use ISO 8601 strings via toISOStringSafe.
 *
 * @param props - Request properties
 * @param props.body - Registration payload containing email and password
 * @returns Authorized context with access/refresh tokens and subject id
 * @throws {HttpException} 400 when password policy fails
 * @throws {HttpException} 409 when email already exists
 * @throws {HttpException} 500 on unexpected errors
 */
export async function postauthTodoUserJoin(props: {
  body: ITodoAppTodoUser.ICreate;
}): Promise<ITodoAppTodoUser.IAuthorized> {
  const { body } = props;

  // Validate password policy (8–64 chars per DTO policy)
  const pwdLen = body.password.length;
  if (pwdLen < 8 || pwdLen > 64) {
    throw new HttpException(
      "Bad Request: Password must be 8-64 characters",
      400,
    );
  }

  // Pre-check duplicate email
  const existing = await MyGlobal.prisma.todo_app_users.findUnique({
    where: { email: body.email },
    select: { id: true },
  });
  if (existing) {
    throw new HttpException("Conflict: Email already registered", 409);
  }

  // Timestamps
  const now = toISOStringSafe(new Date());
  const accessExpiresAt = toISOStringSafe(
    new Date(Date.now() + 60 * 60 * 1000),
  ); // 1 hour
  const refreshExpiresAt = toISOStringSafe(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  ); // 7 days

  // Identifiers and tokens
  const userId = v4();
  const roleId = v4();
  const sessionId = v4();
  const sessionToken = v4();
  const refreshId = v4();
  const loginAttemptId = v4();

  // Hash password
  const passwordHash = await MyGlobal.password.hash(body.password);

  // JWTs (payload aligns with role payload structure)
  const accessToken = jwt.sign(
    { id: userId, type: "todouser" },
    MyGlobal.env.JWT_SECRET_KEY,
    { expiresIn: "1h", issuer: "autobe" },
  );
  const refreshToken = jwt.sign(
    { id: userId, type: "todouser", tokenType: "refresh" },
    MyGlobal.env.JWT_SECRET_KEY,
    { expiresIn: "7d", issuer: "autobe" },
  );

  const refreshTokenHash = await MyGlobal.password.hash(refreshToken);

  try {
    await MyGlobal.prisma.$transaction(async (tx) => {
      // Create user
      await tx.todo_app_users.create({
        data: {
          id: userId,
          email: body.email,
          password_hash: passwordHash,
          status: "active",
          email_verified: false,
          verified_at: null,
          last_login_at: now,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      });

      // Assign todoUser role
      await tx.todo_app_todousers.create({
        data: {
          id: roleId,
          todo_app_user_id: userId,
          granted_at: now,
          revoked_at: null,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      });

      // Create session (no client context provided → ip empty string not acceptable here because ip? is optional; keep null)
      await tx.todo_app_sessions.create({
        data: {
          id: sessionId,
          todo_app_user_id: userId,
          session_token: sessionToken,
          ip: null,
          user_agent: null,
          issued_at: now,
          expires_at: accessExpiresAt,
          revoked_at: null,
          revoked_reason: null,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      });

      // Initial refresh token
      await tx.todo_app_refresh_tokens.create({
        data: {
          id: refreshId,
          todo_app_session_id: sessionId,
          parent_id: null,
          token: refreshToken,
          token_hash: refreshTokenHash,
          issued_at: now,
          expires_at: refreshExpiresAt,
          rotated_at: null,
          revoked_at: null,
          revoked_reason: null,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      });

      // Login attempt success (ip is required here → use empty string when unavailable)
      await tx.todo_app_login_attempts.create({
        data: {
          id: loginAttemptId,
          todo_app_user_id: userId,
          email: body.email,
          success: true,
          ip: "",
          user_agent: null,
          failure_reason: null,
          occurred_at: now,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        throw new HttpException("Conflict: Resource already exists", 409);
      }
    }
    throw new HttpException("Internal Server Error", 500);
  }

  // Brand id in return using runtime assertion without type-cast
  const result = {
    id: typia.assert<string & tags.Format<"uuid">>(userId),
    token: {
      access: accessToken,
      refresh: refreshToken,
      expired_at: accessExpiresAt,
      refreshable_until: refreshExpiresAt,
    },
  } satisfies ITodoAppTodoUser.IAuthorized;

  return result;
}
