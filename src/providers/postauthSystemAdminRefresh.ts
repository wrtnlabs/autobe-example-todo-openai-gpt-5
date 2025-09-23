import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppSystemAdminRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminRefresh";
import { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";

export async function postauthSystemAdminRefresh(props: {
  body: ITodoAppSystemAdminRefresh.ICreate;
}): Promise<ITodoAppSystemAdmin.IAuthorized> {
  const { body } = props;

  // Timestamps
  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());
  const accessExpiredAt: string & tags.Format<"date-time"> = toISOStringSafe(
    new Date(Date.now() + 60 * 60 * 1000),
  );
  const refreshExpiresAt: string & tags.Format<"date-time"> = toISOStringSafe(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  );

  // Validate and load current refresh token with session constraints
  const current = await MyGlobal.prisma.todo_app_refresh_tokens.findFirst({
    where: {
      token: body.refresh_token,
      rotated_at: null,
      revoked_at: null,
      deleted_at: null,
      expires_at: { gt: now },
      session: {
        is: {
          revoked_at: null,
          deleted_at: null,
          expires_at: { gt: now },
        },
      },
    },
    include: { session: true },
  });

  if (!current || !current.session) {
    throw new HttpException(
      "Unauthorized: Invalid or expired refresh token",
      401,
    );
  }

  // Ensure the user still has active systemadmin role
  const adminRole = await MyGlobal.prisma.todo_app_systemadmins.findFirst({
    where: {
      todo_app_user_id: current.session.todo_app_user_id,
      revoked_at: null,
      deleted_at: null,
    },
  });
  if (!adminRole) {
    throw new HttpException("Forbidden: Not a system administrator", 403);
  }

  // Prepare new refresh token value (opaque)
  const newRefreshToken: string = `${v4()}.${v4()}`;

  // Rotate within a transaction to avoid race conditions
  await MyGlobal.prisma.$transaction(async (tx) => {
    // Mark current token as rotated
    await tx.todo_app_refresh_tokens.update({
      where: { id: current.id },
      data: {
        rotated_at: now,
        updated_at: now,
      },
    });

    // Update session metadata (optional ip/ua) and touch updated_at
    await tx.todo_app_sessions.update({
      where: { id: current.session.id },
      data: {
        ip: body.ip ?? undefined,
        user_agent: body.user_agent ?? undefined,
        updated_at: now,
      },
    });

    // Issue new child refresh token linked to same session
    await tx.todo_app_refresh_tokens.create({
      data: {
        id: v4(),
        todo_app_session_id: current.session.id,
        parent_id: current.id,
        token: newRefreshToken,
        token_hash: newRefreshToken, // In production, store a one-way hash
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
  });

  // Build access token payload for system administrator
  const payload = {
    id: current.session.todo_app_user_id as string & tags.Format<"uuid">,
    type: "systemadmin" as const,
  } satisfies import("../decorators/payload/SystemadminPayload").SystemadminPayload;

  const accessToken = jwt.sign(payload, MyGlobal.env.JWT_SECRET_KEY, {
    expiresIn: "1h",
    issuer: "autobe",
  });

  // Construct response
  const response = {
    id: current.session.todo_app_user_id as string & tags.Format<"uuid">,
    token: {
      access: accessToken,
      refresh: newRefreshToken,
      expired_at: accessExpiredAt,
      refreshable_until: refreshExpiresAt,
    },
  } satisfies ITodoAppSystemAdmin.IAuthorized;

  return response;
}
