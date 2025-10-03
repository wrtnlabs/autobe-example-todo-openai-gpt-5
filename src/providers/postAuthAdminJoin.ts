import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ITodoMvpAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdminJoin";
import { ITodoMvpAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpAdmin";
import { IEAdminStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAdminStatus";
import { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";

export async function postAuthAdminJoin(props: {
  body: ITodoMvpAdminJoin.ICreate;
}): Promise<ITodoMvpAdmin.IAuthorized> {
  const { body } = props;

  // 1) Pre-check for duplicate email (unique constraint guard)
  const existing = await MyGlobal.prisma.todo_mvp_admins.findFirst({
    where: { email: body.email },
    select: { id: true },
  });
  if (existing) {
    throw new HttpException("Conflict: Admin email already exists", 409);
  }

  // 2) Prepare values
  const adminId = v4() as string & tags.Format<"uuid">;
  const sessionId = v4() as string & tags.Format<"uuid">;
  const now = toISOStringSafe(new Date());
  const status: IEAdminStatus = "active";

  // Hash password and create a random session token (hashed in DB)
  const passwordHash = await PasswordUtil.hash(body.password);
  const rawSessionToken = `${v4()}.${v4()}`;
  const sessionTokenHash = await PasswordUtil.hash(rawSessionToken);

  // Token expirations
  const accessExpiredAt = toISOStringSafe(
    new Date(Date.now() + 60 * 60 * 1000),
  ); // 1h
  const refreshableUntil = toISOStringSafe(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  ); // 7d

  // 3) Create admin and initial session atomically
  try {
    const [created] = await MyGlobal.prisma.$transaction([
      MyGlobal.prisma.todo_mvp_admins.create({
        data: {
          id: adminId,
          email: body.email,
          password_hash: passwordHash,
          status: status,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      }),
      MyGlobal.prisma.todo_mvp_sessions.create({
        data: {
          id: sessionId,
          todo_mvp_user_id: null,
          todo_mvp_admin_id: adminId,
          session_token_hash: sessionTokenHash,
          created_at: now,
          updated_at: now,
          last_accessed_at: now,
          expires_at: refreshableUntil, // align session lifetime with refresh window
          revoked_at: null,
        },
      }),
    ]);

    // 4) Issue JWT tokens
    const access = jwt.sign(
      {
        id: created.id,
        type: "admin",
        email: created.email,
        status: created.status,
      },
      MyGlobal.env.JWT_SECRET_KEY,
      {
        expiresIn: "1h",
        issuer: "autobe",
      },
    );

    const refresh = jwt.sign(
      {
        id: created.id,
        type: "admin",
        tokenType: "refresh",
      },
      MyGlobal.env.JWT_SECRET_KEY,
      {
        expiresIn: "7d",
        issuer: "autobe",
      },
    );

    // 5) Build response matching ITodoMvpAdmin.IAuthorized
    return {
      id: created.id as string & tags.Format<"uuid">,
      email: created.email as string & tags.Format<"email">,
      status: created.status as IEAdminStatus,
      created_at: toISOStringSafe(created.created_at),
      updated_at: toISOStringSafe(created.updated_at),
      deleted_at: created.deleted_at
        ? toISOStringSafe(created.deleted_at)
        : null,
      token: {
        access,
        refresh,
        expired_at: accessExpiredAt,
        refreshable_until: refreshableUntil,
      },
      admin: {
        id: created.id as string & tags.Format<"uuid">,
        email: created.email as string & tags.Format<"email">,
        status: created.status as IEAccountStatus,
        created_at: toISOStringSafe(created.created_at),
        updated_at: toISOStringSafe(created.updated_at),
        deleted_at: created.deleted_at
          ? toISOStringSafe(created.deleted_at)
          : null,
      },
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        throw new HttpException("Conflict: Admin email already exists", 409);
      }
    }
    throw new HttpException(
      "Internal Server Error: Failed to register admin",
      500,
    );
  }
}
