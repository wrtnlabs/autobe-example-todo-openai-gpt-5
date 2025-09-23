import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppGuestVisitor";

export async function postauthGuestVisitorJoin(props: {
  body: ITodoAppGuestVisitor.IJoin;
}): Promise<ITodoAppGuestVisitor.IAuthorized> {
  /**
   * Register a guestVisitor and issue JWT credentials.
   *
   * Creates a minimal user in todo_app_users, a session in todo_app_sessions,
   * and an initial refresh token in todo_app_refresh_tokens. Email is optional
   * in DTO but required in schema; when absent, a synthetic unique guest email
   * is generated. Passwords are never stored in plaintext; a random value is
   * hashed and saved in password_hash. Returns access/refresh tokens with
   * expiration metadata.
   *
   * @param props - Request properties
   * @param props.body - Guest join payload (optional email)
   * @returns Authorization info including access/refresh tokens
   * @throws {HttpException} 409 when email already exists
   * @throws {HttpException} 500 on unexpected failures
   */
  const { body } = props;

  // Prepare timestamps
  const now = toISOStringSafe(new Date());
  const accessExpiresAt = toISOStringSafe(
    new Date(Date.now() + 60 * 60 * 1000),
  ); // 1h
  const refreshExpiresAt = toISOStringSafe(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  ); // 7d

  // Determine email: use provided, or synthesize unique guest email
  const providedEmail = body.email ?? null;
  const userId = v4() as string & tags.Format<"uuid">;
  const sessionId = v4() as string & tags.Format<"uuid">;
  const sessionToken = v4();
  const rawRefreshToken = `${v4()}.${v4()}`;
  const refreshTokenId = v4() as string & tags.Format<"uuid">;

  const finalEmail = providedEmail ?? `guest+${userId}@guest.local`;

  // Duplicate check only when client supplied an email
  if (providedEmail !== null) {
    const exists = await MyGlobal.prisma.todo_app_users.findUnique({
      where: { email: finalEmail },
      select: { id: true },
    });
    if (exists) throw new HttpException("Conflict: Email already in use", 409);
  }

  // Hash password (random) and refresh token
  const passwordSeed = v4();
  const passwordHash = await MyGlobal.password.hash(passwordSeed);
  const refreshTokenHash = await MyGlobal.password.hash(rawRefreshToken);

  try {
    await MyGlobal.prisma.$transaction(async (tx) => {
      await tx.todo_app_users.create({
        data: {
          id: userId,
          email: finalEmail,
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

      await tx.todo_app_refresh_tokens.create({
        data: {
          id: refreshTokenId,
          todo_app_session_id: sessionId,
          parent_id: null,
          token: refreshTokenHash, // Store only hashed value for security
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

      // Optionally enqueue email verification when email is provided
      if (providedEmail !== null) {
        const evId = v4() as string & tags.Format<"uuid">;
        const evRaw = `${v4()}.${v4()}.${v4()}`;
        const evHash = await MyGlobal.password.hash(evRaw);
        const evExpires = toISOStringSafe(
          new Date(Date.now() + 24 * 60 * 60 * 1000),
        ); // 24h
        await tx.todo_app_email_verifications.create({
          data: {
            id: evId,
            todo_app_user_id: userId,
            token: evHash,
            token_hash: evHash,
            target_email: finalEmail,
            sent_at: now,
            expires_at: evExpires,
            consumed_at: null,
            failure_count: 0,
            consumed_by_ip: null,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          },
        });
      }
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Unique constraint (likely email) violation
      throw new HttpException("Conflict: Duplicate resource", 409);
    }
    throw new HttpException("Internal Server Error", 500);
  }

  // Issue JWT tokens
  const accessToken = (
    global as unknown as { jwt: typeof import("jsonwebtoken") }
  ).jwt
    ? (global as any).jwt.sign(
        { id: userId, type: "guestvisitor" },
        MyGlobal.env.JWT_SECRET_KEY,
        {
          expiresIn: "1h",
          issuer: "autobe",
        },
      )
    : ((): string => {
        // Fallback to imported jwt if global injection not present
        return (require("jsonwebtoken") as typeof import("jsonwebtoken")).sign(
          { id: userId, type: "guestvisitor" },
          MyGlobal.env.JWT_SECRET_KEY,
          { expiresIn: "1h", issuer: "autobe" },
        );
      })();

  return {
    id: userId,
    token: {
      access: accessToken,
      refresh: rawRefreshToken,
      expired_at: accessExpiresAt,
      refreshable_until: refreshExpiresAt,
    },
  };
}
