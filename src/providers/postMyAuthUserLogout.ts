import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { IResult } from "@ORGANIZATION/PROJECT-api/lib/structures/IResult";
import { UserPayload } from "../decorators/payload/UserPayload";

export async function postMyAuthUserLogout(props: {
  user: UserPayload;
}): Promise<IResult.ISuccess> {
  const { user } = props;

  // Authorization guard: ensure correct role context
  if (!user || user.type !== "user") {
    throw new HttpException(
      "Forbidden: only authenticated users can logout",
      403,
    );
  }

  // Prepare a single timestamp for consistent auditing
  const now = toISOStringSafe(new Date());

  // Locate the most recently used, non-revoked, non-expired session for this user
  const currentSession = await MyGlobal.prisma.todo_mvp_sessions.findFirst({
    where: {
      todo_mvp_user_id: user.id,
      revoked_at: null,
      expires_at: { gt: now },
    },
    orderBy: { last_accessed_at: "desc" },
  });

  // Idempotent behavior: if no active session found, return success
  if (currentSession === null) {
    return {
      success: true,
      message: "No active session to revoke.",
    };
  }

  // Revoke the located session (mark as explicitly ended)
  await MyGlobal.prisma.todo_mvp_sessions.update({
    where: { id: currentSession.id },
    data: {
      revoked_at: now,
      updated_at: now,
    },
  });

  return {
    success: true,
    message: "Session has been revoked successfully.",
  };
}
