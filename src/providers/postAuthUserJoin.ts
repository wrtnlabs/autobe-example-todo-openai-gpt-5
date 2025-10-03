import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";
import { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";

/**
 * Register a new member in Actors.todo_mvp_users and create session in
 * Auth.todo_mvp_sessions.
 *
 * Creates a user with unique email, securely hashes the password, issues JWT
 * tokens, stores a hashed bearer in sessions, and returns an authorization
 * payload.
 *
 * Public endpoint (no authentication required).
 *
 * @param props - Request properties
 * @param props.body - Registration payload containing email and password
 * @returns Authorized session information for the newly created user
 * @throws {HttpException} 409 when email is already registered
 * @throws {HttpException} 500 on unexpected errors
 */
export async function postAuthUserJoin(props: {
  body: ITodoMvpUser.ICreate;
}): Promise<ITodoMvpUser.IAuthorized> {
  const { body } = props;

  // 1) Enforce unique email pre-check
  const existing = await MyGlobal.prisma.todo_mvp_users.findUnique({
    where: { email: body.email },
    select: { id: true },
  });
  if (existing) {
    throw new HttpException("Conflict: Email already registered", 409);
  }

  // 2) Prepare identifiers and timestamps
  const userId = v4() as string & tags.Format<"uuid">;
  const sessionId = v4() as string & tags.Format<"uuid">;

  const now = toISOStringSafe(new Date());
  const accessExpiresAt = toISOStringSafe(
    new Date(Date.now() + 60 * 60 * 1000),
  ); // 1 hour
  const refreshExpiresAt = toISOStringSafe(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  ); // 7 days

  // 3) Hash password
  const passwordHash = await PasswordUtil.hash(body.password);

  try {
    // 4) Create user
    const createdUser = await MyGlobal.prisma.todo_mvp_users.create({
      data: {
        id: userId,
        email: body.email,
        password_hash: passwordHash,
        status: "active",
        created_at: now,
        updated_at: now,
      },
      select: { id: true, email: true, status: true },
    });

    // 5) Issue JWT tokens
    const access = jwt.sign(
      {
        id: createdUser.id,
        type: "user",
        email: createdUser.email,
      },
      MyGlobal.env.JWT_SECRET_KEY,
      { expiresIn: "1h", issuer: "autobe" },
    );

    const refresh = jwt.sign(
      {
        id: createdUser.id,
        type: "user",
        tokenType: "refresh",
      },
      MyGlobal.env.JWT_SECRET_KEY,
      { expiresIn: "7d", issuer: "autobe" },
    );

    // 6) Persist session with hashed bearer
    const sessionTokenHash = await PasswordUtil.hash(access);
    await MyGlobal.prisma.todo_mvp_sessions.create({
      data: {
        id: sessionId,
        todo_mvp_user_id: createdUser.id,
        session_token_hash: sessionTokenHash,
        created_at: now,
        updated_at: now,
        last_accessed_at: now,
        expires_at: refreshExpiresAt,
      },
    });

    // 7) Compose response
    const token: IAuthorizationToken = {
      access,
      refresh,
      expired_at: accessExpiresAt,
      refreshable_until: refreshExpiresAt,
    };

    const user: ITodoMvpUser = {
      id: createdUser.id as string & tags.Format<"uuid">,
      email: createdUser.email as string & tags.Format<"email">,
      status: createdUser.status as IEAccountStatus,
      created_at: now,
      updated_at: now,
    };

    const response: ITodoMvpUser.IAuthorized = {
      id: user.id,
      email: user.email,
      status: user.status,
      created_at: user.created_at,
      updated_at: user.updated_at,
      // deleted_at omitted (undefined) by design in registration flow
      token,
      user,
    };

    return response;
  } catch (err) {
    // Handle races on unique constraint
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new HttpException("Conflict: Email already registered", 409);
    }
    throw new HttpException("Internal Server Error", 500);
  }
}
