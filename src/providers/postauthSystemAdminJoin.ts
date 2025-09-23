import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";

/**
 * Register a new system administrator and issue initial JWT credentials.
 *
 * Creates a todo_app_users row, grants system admin role in
 * todo_app_systemadmins, initializes an auth session and a refresh token, then
 * returns access/refresh tokens with expirations.
 *
 * Security:
 *
 * - Password is hashed using MyGlobal.password
 * - Email uniqueness enforced; duplicate results in 409 Conflict
 * - Access token issuer set to 'autobe'
 *
 * @param props - Request properties
 * @param props.body - Registration payload including email, password, optional
 *   ip and user_agent
 * @returns Authorized DTO containing admin id and token pair (access/refresh)
 * @throws {Error} 409 when email already exists; 500 on unexpected errors
 */
export async function postauthSystemAdminJoin(props: {
  body: ITodoAppSystemAdminJoin.ICreate;
}): Promise<ITodoAppSystemAdmin.IAuthorized> {
  const { body } = props;

  // Pre-check for duplicate email to provide friendly 409 before create
  const existing = await MyGlobal.prisma.todo_app_users.findUnique({
    where: { email: body.email },
    select: { id: true },
  });
  if (existing) {
    throw new HttpException("Conflict: Email already exists", 409);
  }

  // Timestamps
  const now = toISOStringSafe(new Date());
  const accessExpiredAt = toISOStringSafe(
    new Date(Date.now() + 60 * 60 * 1000),
  ); // 1h
  const refreshableUntil = toISOStringSafe(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  ); // 7d

  // Hash password
  const passwordHash = await MyGlobal.password.hash(body.password);

  try {
    const { userId, refreshTokenValue } = await MyGlobal.prisma.$transaction(
      async (tx) => {
        const createdUser = await tx.todo_app_users.create({
          data: {
            id: v4(),
            email: body.email,
            password_hash: passwordHash,
            status: "active",
            email_verified: true,
            verified_at: now,
            last_login_at: now,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          },
          select: { id: true },
        });

        await tx.todo_app_systemadmins.create({
          data: {
            id: v4(),
            todo_app_user_id: createdUser.id,
            granted_at: now,
            revoked_at: null,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          },
        });

        const session = await tx.todo_app_sessions.create({
          data: {
            id: v4(),
            todo_app_user_id: createdUser.id,
            session_token: v4(),
            ip: body.ip ?? null,
            user_agent: body.user_agent ?? null,
            issued_at: now,
            expires_at: refreshableUntil,
            revoked_at: null,
            revoked_reason: null,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          },
          select: { id: true },
        });

        const refreshTokenValue = v4();
        const refreshTokenHash =
          await MyGlobal.password.hash(refreshTokenValue);
        await tx.todo_app_refresh_tokens.create({
          data: {
            id: v4(),
            todo_app_session_id: session.id,
            parent_id: null,
            token: refreshTokenValue,
            token_hash: refreshTokenHash,
            issued_at: now,
            expires_at: refreshableUntil,
            rotated_at: null,
            revoked_at: null,
            revoked_reason: null,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          },
        });

        return { userId: createdUser.id, refreshTokenValue };
      },
    );

    // Access token (JWT) for systemadmin
    const accessToken = jwt.sign(
      {
        id: userId as string & tags.Format<"uuid">,
        type: "systemadmin" as "systemadmin",
      },
      MyGlobal.env.JWT_SECRET_KEY,
      { expiresIn: "1h", issuer: "autobe" },
    );

    return {
      id: userId as string & tags.Format<"uuid">,
      token: {
        access: accessToken,
        refresh: refreshTokenValue,
        expired_at: accessExpiredAt,
        refreshable_until: refreshableUntil,
      },
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        throw new HttpException("Conflict: Email already exists", 409);
      }
    }
    throw new HttpException("Internal Server Error", 500);
  }
}
