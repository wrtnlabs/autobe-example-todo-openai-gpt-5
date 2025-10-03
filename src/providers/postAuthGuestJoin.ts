import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ITodoMvpGuest } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpGuest";
import { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";

export async function postAuthGuestJoin(props: {
  body: ITodoMvpGuest.ICreate;
}): Promise<ITodoMvpGuest.IAuthorized> {
  try {
    // Time points
    const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());
    const accessExpiredAt: string & tags.Format<"date-time"> = toISOStringSafe(
      new Date(Date.now() + 60 * 60 * 1000),
    );
    const refreshableUntil: string & tags.Format<"date-time"> = toISOStringSafe(
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    );

    // Generate identity id
    const guestId = v4() as string & tags.Format<"uuid">;
    const sessionId = v4() as string & tags.Format<"uuid">;

    // Sign JWTs (public endpoint; no password flow for guests)
    const accessToken = jwt.sign(
      { id: guestId, type: "guest" },
      MyGlobal.env.JWT_SECRET_KEY,
      { expiresIn: "1h", issuer: "autobe" },
    );
    const refreshToken = jwt.sign(
      { id: guestId, type: "guest", tokenType: "refresh" },
      MyGlobal.env.JWT_SECRET_KEY,
      { expiresIn: "7d", issuer: "autobe" },
    );

    // Hash the refresh token for DB storage (never store plaintext)
    const sessionTokenHash: string = await PasswordUtil.hash(refreshToken);

    // Persist guest + session in a transaction
    await MyGlobal.prisma.$transaction(async (tx) => {
      await tx.todo_mvp_guests.create({
        data: {
          id: guestId,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      });

      await tx.todo_mvp_sessions.create({
        data: {
          id: sessionId,
          todo_mvp_user_id: null,
          todo_mvp_admin_id: null,
          session_token_hash: sessionTokenHash,
          created_at: now,
          updated_at: now,
          last_accessed_at: now,
          expires_at: refreshableUntil,
          revoked_at: null,
        },
      });
    });

    // Build response
    return {
      id: guestId,
      created_at: now,
      updated_at: now,
      token: {
        access: accessToken,
        refresh: refreshToken,
        expired_at: accessExpiredAt,
        refreshable_until: refreshableUntil,
      },
      guest: {
        id: guestId,
        created_at: now,
        updated_at: now,
      },
    };
  } catch (err) {
    // Surface consistent error shape
    throw new HttpException(
      `Failed to register guest identity: ${err instanceof Error ? err.message : "Unknown error"}`,
      500,
    );
  }
}
